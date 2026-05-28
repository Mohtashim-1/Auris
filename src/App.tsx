import { useCallback, useEffect, useRef, useState } from "react";
import { invokeSafe, listenSafe } from "./lib/tauri";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { LoadingScreen } from "./components/LoadingScreen";
import { Onboarding } from "./components/Onboarding";
import { Sidebar, type PageId } from "./components/Sidebar";
import { AskAuris } from "./pages/AskAuris";
import { Dashboard } from "./pages/Dashboard";
import { History } from "./pages/History";
import { Search } from "./pages/Search";
import { Settings } from "./pages/Settings";
import { Tasks } from "./pages/Tasks";
import { Today } from "./pages/Today";
import {
  api,
  MIN_API_VERSION,
  type SessionSummary,
  type TranscriptLine,
} from "./lib/api";

function App() {
  const [page, setPage] = useState<PageId>("today");
  const [sidecarReady, setSidecarReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [sidecarStale, setSidecarStale] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionDurationSec, setSessionDurationSec] = useState(0);
  const [ocrReady, setOcrReady] = useState<boolean | undefined>(undefined);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const [historySessionId, setHistorySessionId] = useState<string | null>(null);
  const recordingStartedAt = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const autoRecordDone = useRef(false);

  const syncTrayRecording = useCallback((rec: boolean) => {
    void invokeSafe("set_recording_state", { recording: rec });
  }, []);

  const refreshSessions = useCallback(() => {
    api.listSessions().then(setSessions).catch(() => setSessions([]));
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await api.getStatus();
      setSidecarReady(true);
      setRecording(status.recording);
      setModelsReady(status.models_ready);
      setModelError(status.model_error);
      setHasApiKey(status.has_api_key);
      setAudioLevel(status.audio_level ?? 0);
      setOcrReady(status.ocr_ready);
      setOcrError(status.ocr_error ?? null);
      setCaptureCount(status.captures_this_session ?? 0);
      setSidecarStale((status.api_version ?? 0) < MIN_API_VERSION);
      syncTrayRecording(status.recording);
      if (status.recording && !recordingStartedAt.current) {
        recordingStartedAt.current = Date.now();
      }
      if (!status.recording) {
        recordingStartedAt.current = null;
        setSessionDurationSec(0);
      }
    } catch {
      setSidecarReady(false);
      setModelError("Cannot reach sidecar on port 9847");
      setModelsReady(false);
    }
  }, [syncTrayRecording]);

  useEffect(() => {
    api.getSettings().then((s) => {
      const done =
        s.onboarding_complete === "1" ||
        localStorage.getItem("auris-onboarding-done") === "1";
      setShowOnboarding(!done);
    }).catch(() => {
      setShowOnboarding(
        localStorage.getItem("auris-onboarding-done") !== "1"
      );
    });
  }, []);

  const notifySummaryReady = useCallback(
    async (title: string, summary: string) => {
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          const perm = await requestPermission();
          granted = perm === "granted";
        }
        if (granted) {
          await sendNotification({
            title: `Summary ready: ${title}`,
            body: summary.slice(0, 200) + (summary.length > 200 ? "…" : ""),
          });
        }
      } catch {
        /* optional */
      }
    },
    []
  );

  const connectStream = useCallback(() => {
    if (eventSourceRef.current) return;
    const es = new EventSource(api.streamUrl());
    eventSourceRef.current = es;

    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data) as {
          type: string;
          line?: TranscriptLine;
          title?: string;
          summary?: string;
          count?: number;
        };
        if (payload.type === "transcript" && payload.line) {
          setLines((prev) => [...prev, payload.line!]);
        }
        if (payload.type === "screenshot" && typeof payload.count === "number") {
          setCaptureCount(payload.count);
        }
        if (payload.type === "summary_ready" && payload.title) {
          void notifySummaryReady(payload.title, payload.summary ?? "");
          refreshSessions();
          void api.getSettings().then((s) => {
            if (s.has_api_key) setHasApiKey(true);
          });
        }
      } catch {
        /* ignore */
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setTimeout(connectStream, 3000);
    };
  }, [notifySummaryReady, refreshSessions]);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, recording ? 500 : 3000);
    return () => clearInterval(interval);
  }, [refreshStatus, recording]);

  useEffect(() => {
    if (sidecarReady) connectStream();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [sidecarReady, connectStream]);

  useEffect(() => {
    if (!recording || !recordingStartedAt.current) return;
    const tick = setInterval(() => {
      if (recordingStartedAt.current) {
        setSessionDurationSec(
          Math.floor((Date.now() - recordingStartedAt.current) / 1000)
        );
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [recording]);

  useEffect(() => {
    if (page === "history") refreshSessions();
  }, [page, recording, refreshSessions]);

  const handleStart = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLines([]);
    try {
      await api.startRecording();
      recordingStartedAt.current = Date.now();
      setCaptureCount(0);
      setRecording(true);
      syncTrayRecording(true);
      setSessionDurationSec(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setLoading(false);
    }
  }, [syncTrayRecording]);

  const handleStop = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.stopRecording();
      setRecording(false);
      syncTrayRecording(false);
      recordingStartedAt.current = null;
      refreshSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop");
    } finally {
      setLoading(false);
    }
  }, [refreshSessions, syncTrayRecording]);

  useEffect(() => {
    if (
      !modelsReady ||
      !sidecarReady ||
      showOnboarding ||
      autoRecordDone.current ||
      recording
    ) {
      return;
    }
    api.getSettings().then((s) => {
      if (s.auto_record_on_launch === "1" && !autoRecordDone.current) {
        autoRecordDone.current = true;
        void handleStart();
      }
    });
  }, [modelsReady, sidecarReady, showOnboarding, recording, handleStart]);

  const handleRetryModels = async () => {
    try {
      const r = await api.retryModels();
      setModelsReady(r.models_ready);
      setModelError(r.model_error);
    } catch (e) {
      setModelError(e instanceof Error ? e.message : "Retry failed");
    }
  };

  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  const toggleRecording = useCallback(() => {
    if (recordingRef.current) void handleStop();
    else void handleStart();
  }, [handleStart, handleStop]);

  useEffect(() => {
    const onTrayToggle = () => toggleRecording();
    window.addEventListener("auris-tray-toggle-record", onTrayToggle);
    return () =>
      window.removeEventListener("auris-tray-toggle-record", onTrayToggle);
  }, [toggleRecording]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenSafe("auris-shortcut-toggle-record", toggleRecording).then(
      (fn) => {
        unlisten = fn;
      }
    );
    return () => unlisten?.();
  }, [toggleRecording]);

  if (!sidecarReady) {
    return (
      <LoadingScreen
        message="Connecting to Auris sidecar"
        submessage="Starting Python backend on port 9847…"
        error={modelError}
      />
    );
  }

  if (sidecarStale) {
    return (
      <LoadingScreen
        message="Sidecar needs a restart"
        submessage={`Requires API version ${MIN_API_VERSION}. Quit Auris and run: fuser -k 9847/tcp && npm run tauri dev`}
        error="New features (dashboard, export, audio meter) need the latest sidecar."
      />
    );
  }

  if (!modelsReady && !modelError) {
    return (
      <LoadingScreen
        message="Loading AI models"
        submessage="Downloading Whisper and sentence-transformers on first run…"
        onRetry={() => void handleRetryModels()}
      />
    );
  }

  const renderPage = () => {
    switch (page) {
      case "today":
        return (
          <Today
            lines={lines}
            recording={recording}
            modelsReady={modelsReady}
            modelError={modelError}
            hasApiKey={hasApiKey}
            loading={loading}
            onStart={handleStart}
            onStop={handleStop}
            onRetryModels={handleRetryModels}
            error={error}
            audioLevel={audioLevel}
            ocrReady={ocrReady}
            ocrError={ocrError}
            captureCount={captureCount}
          />
        );
      case "dashboard":
        return <Dashboard />;
      case "tasks":
        return (
          <Tasks
            onOpenSession={(id) => {
              setHistorySessionId(id);
              setPage("history");
            }}
          />
        );
      case "history":
        return (
          <History
            sessions={sessions}
            hasApiKey={hasApiKey}
            onRefresh={refreshSessions}
            initialSessionId={historySessionId}
            onInitialSessionConsumed={() => setHistorySessionId(null)}
          />
        );
      case "search":
        return <Search />;
      case "ask":
        return <AskAuris hasApiKey={hasApiKey} sidecarReady={sidecarReady} />;
      case "settings":
        return <Settings />;
    }
  };

  return (
    <>
      {showOnboarding && (
        <Onboarding
          hasApiKey={hasApiKey}
          onComplete={() => {
            setShowOnboarding(false);
            void refreshStatus();
          }}
        />
      )}
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          active={page}
          onNavigate={setPage}
          recording={recording}
          sessionDurationSec={sessionDurationSec}
          hasApiKey={hasApiKey}
        />
        <main className="min-w-0 flex-1 overflow-hidden">{renderPage()}</main>
      </div>
    </>
  );
}

export default App;
