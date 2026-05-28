import { useCallback, useEffect, useRef, useState } from "react";
import { invokeSafe, listenSafe } from "./lib/tauri";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { LoadingScreen } from "./components/LoadingScreen";
import { Sidebar, type PageId } from "./components/Sidebar";
import { AskAuris } from "./pages/AskAuris";
import { History } from "./pages/History";
import { Search } from "./pages/Search";
import { Settings } from "./pages/Settings";
import { Today } from "./pages/Today";
import { api, type SessionSummary, type TranscriptLine } from "./lib/api";

function App() {
  const [page, setPage] = useState<PageId>("today");
  const [sidecarReady, setSidecarReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [sidecarStale, setSidecarStale] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionDurationSec, setSessionDurationSec] = useState(0);
  const recordingStartedAt = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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
      setSidecarStale((status.api_version ?? 0) < 3);
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
        };
        if (payload.type === "transcript" && payload.line) {
          setLines((prev) => [...prev, payload.line!]);
        }
        if (payload.type === "summary_ready" && payload.title) {
          void notifySummaryReady(payload.title, payload.summary ?? "");
          refreshSessions();
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
    const interval = setInterval(refreshStatus, 3000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

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
        submessage="An older Python backend is still running on port 9847. Quit Auris fully and run npm run tauri dev again, or run: fuser -k 9847/tcp"
        error="Export, re-summarize, and auto-titles require API version 3."
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
          />
        );
      case "history":
        return (
          <History
            sessions={sessions}
            hasApiKey={hasApiKey}
            onRefresh={refreshSessions}
          />
        );
      case "search":
        return <Search />;
      case "ask":
        return <AskAuris />;
      case "settings":
        return <Settings />;
    }
  };

  return (
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
  );
}

export default App;
