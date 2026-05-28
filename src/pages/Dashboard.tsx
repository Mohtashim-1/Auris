import { useEffect, useState } from "react";
import { api, formatDuration, type StatsResponse } from "../lib/api";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function Dashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getStats()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const cards = stats
    ? [
        { label: "Sessions", value: String(stats.session_count) },
        { label: "Transcript lines", value: String(stats.transcript_line_count) },
        { label: "Recording time", value: formatDuration(stats.total_duration_seconds) },
        { label: "Open action items", value: String(stats.open_action_items) },
        { label: "Screen captures", value: String(stats.screen_capture_count) },
        { label: "Memory vectors", value: String(stats.memory_vectors) },
        { label: "Storage used", value: formatBytes(stats.storage_bytes) },
      ]
    : [];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Overview of your local Auris memory
        </p>
      </header>

      <div className="p-6">
        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {!stats && !error && (
          <p className="text-sm text-gray-400">Loading stats…</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <p className="text-xs text-gray-400">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold text-primary">{c.value}</p>
            </div>
          ))}
        </div>
        {stats && (
          <p className="mt-6 text-xs text-gray-400">
            Data path: <code>{stats.data_path}</code>
          </p>
        )}
      </div>
    </div>
  );
}
