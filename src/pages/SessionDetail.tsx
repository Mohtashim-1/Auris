import { useEffect, useState } from "react";
import { TranscriptLine } from "../components/TranscriptLine";
import {
  api,
  formatDate,
  formatDuration,
  formatTime,
  type SessionDetail as Session,
} from "../lib/api";

interface Props {
  sessionId: string;
  hasApiKey: boolean;
  onBack: () => void;
  onDeleted: () => void;
}

export function SessionDetail({
  sessionId,
  hasApiKey,
  onBack,
  onDeleted,
}: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .getSession(sessionId)
      .then(setSession)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [sessionId]);

  const toggleItem = async (id: string, done: boolean) => {
    await api.toggleActionItem(id, done);
    load();
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    setError(null);
    try {
      await api.summarizeSession(sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Summarization failed");
    } finally {
      setSummarizing(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteSession(sessionId);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="p-6">
        <button type="button" onClick={onBack} className="text-sm text-primary">
          ← Back
        </button>
        <p className="mt-4 text-red-600">{error}</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 text-sm text-primary hover:underline"
        >
          ← History
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {session.title || "Untitled session"}
            </h2>
            <p className="text-sm text-gray-500">
              {formatDate(session.started_at)}
              {session.duration_seconds != null &&
                ` · ${formatDuration(session.duration_seconds)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                void api.exportSession(sessionId, "md").catch((e) =>
                  setError(e instanceof Error ? e.message : "Export failed")
                )
              }
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Export MD
            </button>
            <button
              type="button"
              onClick={() =>
                void api.exportSession(sessionId, "txt").catch((e) =>
                  setError(e instanceof Error ? e.message : "Export failed")
                )
              }
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Export TXT
            </button>
            {hasApiKey && (
              <button
                type="button"
                disabled={summarizing}
                onClick={() => void handleSummarize()}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {summarizing ? "Summarizing…" : "Re-summarize"}
              </button>
            )}
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20"
              >
                Delete
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700"
              >
                Confirm delete
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {session.summary ? (
          <section className="mb-8">
            <h3 className="mb-2 text-sm font-medium text-gray-500">Summary</h3>
            <p className="rounded-xl bg-gray-50 p-4 text-sm leading-relaxed dark:bg-gray-900">
              {session.summary}
            </p>
          </section>
        ) : (
          hasApiKey && (
            <p className="mb-6 text-sm text-gray-400">
              No summary yet. Click Re-summarize to generate one.
            </p>
          )
        )}

        {session.action_items.length > 0 && (
          <section className="mb-8">
            <h3 className="mb-2 text-sm font-medium text-gray-500">
              Action items
            </h3>
            <ul className="space-y-2">
              {session.action_items.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={item.done === 1}
                    onChange={(e) =>
                      void toggleItem(item.id, e.target.checked)
                    }
                    className="mt-1 rounded border-gray-300"
                  />
                  <span
                    className={`text-sm ${item.done ? "text-gray-400 line-through" : ""}`}
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {session.screen_captures.length > 0 && (
          <section className="mb-8">
            <h3 className="mb-2 text-sm font-medium text-gray-500">
              Screen context ({session.screen_captures.length})
            </h3>
            <div className="space-y-3">
              {session.screen_captures.map((cap) => (
                <div
                  key={cap.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900"
                >
                  <time className="text-xs text-gray-400">
                    {formatTime(cap.captured_at)}
                  </time>
                  <p className="mt-1 line-clamp-6 text-sm text-gray-700 dark:text-gray-300">
                    {cap.ocr_text}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-medium text-gray-500">
            Transcript
          </h3>
          {session.transcript.length === 0 ? (
            <p className="text-sm text-gray-400">No transcript lines.</p>
          ) : (
            session.transcript.map((line) => (
              <TranscriptLine key={line.id} line={line} />
            ))
          )}
        </section>
      </div>
    </div>
  );
}
