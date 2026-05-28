import { useMemo, useState } from "react";
import { SessionCard } from "../components/SessionCard";
import { SessionDetail } from "./SessionDetail";
import type { SessionSummary } from "../lib/api";

interface Props {
  sessions: SessionSummary[];
  hasApiKey: boolean;
  onRefresh: () => void;
}

export function History({ sessions, hasApiKey, onRefresh }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        (s.title || "").toLowerCase().includes(q) ||
        (s.summary || "").toLowerCase().includes(q)
    );
  }, [sessions, query]);

  if (selectedId) {
    return (
      <SessionDetail
        sessionId={selectedId}
        hasApiKey={hasApiKey}
        onBack={() => {
          setSelectedId(null);
          onRefresh();
        }}
        onDeleted={() => {
          setSelectedId(null);
          onRefresh();
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h2 className="text-xl font-semibold">History</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Past sessions with AI summaries and action items
        </p>
      </header>
      <div className="border-b border-gray-200 px-6 py-3 dark:border-gray-800">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title or summary…"
          className="w-full max-w-xl rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-400">
            {sessions.length === 0
              ? "No sessions yet. Record something on Today."
              : "No sessions match your filter."}
          </p>
        ) : (
          <div className="mx-auto max-w-2xl space-y-3">
            {filtered.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onClick={() => setSelectedId(s.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
