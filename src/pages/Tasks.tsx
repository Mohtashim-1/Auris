import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  formatDate,
  type ActionItemWithSession,
} from "../lib/api";

interface Props {
  onOpenSession: (sessionId: string) => void;
}

type ColumnId = "todo" | "done";

const COLUMNS: { id: ColumnId; title: string; done: boolean }[] = [
  { id: "todo", title: "To do", done: false },
  { id: "done", title: "Done", done: true },
];

function TaskCard({
  item,
  onOpenSession,
  onToggle,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  item: ActionItemWithSession;
  onOpenSession: (sessionId: string) => void;
  onToggle: (id: string, done: boolean) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging?: boolean;
}) {
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", item.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-shadow active:cursor-grabbing dark:border-gray-700 dark:bg-gray-900 ${
        dragging ? "opacity-50 ring-2 ring-primary/30" : "hover:shadow-md"
      }`}
    >
      <p className="text-sm leading-snug text-gray-800 dark:text-gray-100">
        {item.text}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenSession(item.session_id)}
          className="truncate text-left text-xs text-primary hover:underline"
        >
          {item.title || "Untitled session"}
        </button>
        <span className="shrink-0 text-[10px] text-gray-400">
          {formatDate(item.started_at)}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onToggle(item.id, !item.done)}
        className="mt-2 w-full rounded-lg border border-gray-200 py-1 text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        {item.done ? "Move to To do" : "Mark done"}
      </button>
    </article>
  );
}

export function Tasks({ onOpenSession }: Props) {
  const [items, setItems] = useState<ActionItemWithSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ColumnId | null>(null);

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

  const byColumn = useMemo(() => {
    const todo = items.filter((i) => !i.done);
    const done = items.filter((i) => i.done);
    return { todo, done };
  }, [items]);

  const moveItem = async (id: string, done: boolean) => {
    const item = items.find((i) => i.id === id);
    if (!item || Boolean(item.done) === done) return;

    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, done: done ? 1 : 0 } : i))
    );
    try {
      await api.toggleActionItem(id, done);
    } catch (e) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, done: item.done } : i
        )
      );
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h2 className="text-xl font-semibold">Tasks</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Kanban board · drag cards between columns · {byColumn.todo.length} open
        </p>
      </header>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 sm:p-6">
        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading tasks…</p>
        ) : items.length === 0 ? (
          <div className="flex h-full min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/30">
            <p className="max-w-sm px-6 text-center text-sm text-gray-400">
              No tasks yet. Stop a recording session with an API key to generate
              action items from your speech and screenshots.
            </p>
          </div>
        ) : (
          <div className="flex h-full min-h-0 gap-4">
            {COLUMNS.map((col) => {
              const columnItems =
                col.id === "todo" ? byColumn.todo : byColumn.done;
              const isDrop = dropTarget === col.id;

              return (
                <section
                  key={col.id}
                  className="flex w-[min(100%,320px)] shrink-0 flex-col sm:w-80"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropTarget(col.id);
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTarget(null);
                    const id = e.dataTransfer.getData("text/task-id");
                    if (id) void moveItem(id, col.id === "done");
                    setDraggingId(null);
                  }}
                >
                  <div className="mb-3 flex items-center justify-between px-1">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      {col.title}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        col.id === "todo"
                          ? "bg-primary/10 text-primary"
                          : "bg-accent/15 text-accent dark:text-accent"
                      }`}
                    >
                      {columnItems.length}
                    </span>
                  </div>

                  <div
                    className={`flex min-h-[120px] flex-1 flex-col gap-3 overflow-y-auto rounded-2xl p-2 transition-colors ${
                      isDrop
                        ? "bg-primary/5 ring-2 ring-primary/25 dark:bg-primary/10"
                        : "bg-gray-100/80 dark:bg-gray-950/50"
                    }`}
                  >
                    {columnItems.length === 0 ? (
                      <p className="px-2 py-8 text-center text-xs text-gray-400">
                        {col.id === "todo"
                          ? "Drop tasks here or they appear after summarization"
                          : "Drag completed tasks here"}
                      </p>
                    ) : (
                      columnItems.map((item) => (
                        <TaskCard
                          key={item.id}
                          item={item}
                          onOpenSession={onOpenSession}
                          onToggle={(id, done) => void moveItem(id, done)}
                          onDragStart={() => setDraggingId(item.id)}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDropTarget(null);
                          }}
                          dragging={draggingId === item.id}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
