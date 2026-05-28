import { useEffect, useRef } from "react";
import { TranscriptLine } from "../components/TranscriptLine";
import type { TranscriptLine as Line } from "../lib/api";

interface TodayProps {
  lines: Line[];
  recording: boolean;
  modelsReady: boolean;
  modelError: string | null;
  hasApiKey: boolean;
  loading: boolean;
  onStart: () => void;
  onStop: () => void;
  onRetryModels: () => void;
  error: string | null;
}

export function Today({
  lines,
  recording,
  modelsReady,
  modelError,
  hasApiKey,
  loading,
  onStart,
  onStop,
  onRetryModels,
  error,
}: TodayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h2 className="text-xl font-semibold">Today</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Live transcript from your microphone
        </p>
      </header>

      <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        {!modelsReady && !modelError && (
          <div className="mb-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            Loading Whisper model… This may take a minute on first run.
          </div>
        )}

        {modelError && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
            <span>Model load failed: {modelError}</span>
            <button
              type="button"
              onClick={onRetryModels}
              className="shrink-0 rounded-md bg-red-600 px-3 py-1 text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

        {!hasApiKey && (
          <div className="mb-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            Add your API key in Settings to enable AI summaries and chat.
            Transcription works without a key.
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={loading || !modelsReady}
          onClick={recording ? onStop : onStart}
          className={`rounded-xl px-8 py-3 text-base font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            recording
              ? "bg-red-600 hover:bg-red-700"
              : "bg-accent hover:bg-accent-dark"
          }`}
        >
          {loading
            ? "Please wait…"
            : recording
              ? "Stop listening"
              : "Start listening"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-2">
        {lines.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">
            {recording
              ? "Listening… speak to see live transcription."
              : "Press Start listening to begin."}
          </p>
        ) : (
          lines.map((line) => <TranscriptLine key={line.id} line={line} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
