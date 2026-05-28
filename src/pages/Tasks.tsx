import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  formatDate,
  type ActionItemWithSession,
} from "../lib/api";

type Filter = "open" | "all" | "done";

interface Props {
  onOpenSession: (sessionId: string) => void;
}

export function Tasks({ onOpenSession }: Props) {
  const [items, setItems] = useState<ActionItemWithSession[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listActionItems(false);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "open") return items.filter((i) => !i.done);
    if (filter === "done") return items.filter((i) => i.done);
    return items;
  }, [items, filter]);

  const openCount = useMemo(() => items.filter((i) => !i.done).length, [items]);

  const toggleItem = async (id: string, done: boolean) => {
    try {
      await api.toggleActionItem(id, done);
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, done: done ? 1 : 0 } : i))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h2 className="text-xl font-semibold">Tasks</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Action items from all sessions · {openCount} open
        </p>
      </header>

      <div className="flex gap-2 border-b border-gray-200 px-6 py-3 dark:border-gray-800">
        {(
          [
            ["open", "Open"],
            ["all", "All"],
            ["done", "Done"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              filter === id
                ? "bg-primary/10 font-medium text-primary"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {loading ? (
          <p className="text-sm text-gray-400">Loading tasks…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400">
            {filter === "open"
              ? "No open tasks. Stop a recording session with an API key to generate action items."
              : "No tasks in this view."}
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              >
                <input
                  type="checkbox"
                  checked={item.done === 1}
                  onChange={(e) => void toggleItem(item.id, e.target.checked)}
                  className="mt-1 rounded border-gray-300"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm ${
                      item.done ? "text-gray-400 line-through" : ""
                    }`}
                  >
                    {item.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenSession(item.session_id)}
                    className="mt-1 text-xs text-primary hover:underline"
                  >
                    {item.title || "Untitled session"} ·{" "}
                    {formatDate(item.started_at)}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
