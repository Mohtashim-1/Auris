export type PageId =
  | "today"
  | "dashboard"
  | "history"
  | "search"
  | "ask"
  | "settings";

interface SidebarProps {
  active: PageId;
  onNavigate: (page: PageId) => void;
  recording: boolean;
  sessionDurationSec: number;
  hasApiKey: boolean;
}

const NAV: { id: PageId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "dashboard", label: "Dashboard" },
  { id: "history", label: "History" },
  { id: "search", label: "Search" },
  { id: "ask", label: "Ask Auris" },
  { id: "settings", label: "Settings" },
];

export function Sidebar({
  active,
  onNavigate,
  recording,
  sessionDurationSec,
  hasApiKey,
}: SidebarProps) {
  const mins = Math.floor(sessionDurationSec / 60);
  const secs = sessionDurationSec % 60;
  const timer = `${mins}:${secs.toString().padStart(2, "0")}`;

  return (
    <aside className="flex w-56 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-5 dark:border-gray-800">
        <h1 className="text-lg font-semibold text-primary">Auris</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Always-on listening
        </p>
      </div>

      {!hasApiKey && (
        <div className="mx-2 mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Add API key in Settings for AI features
        </div>
      )}

      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`flex w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              active === item.id
                ? "bg-primary/10 font-medium text-primary dark:bg-primary/20"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="border-t border-gray-200 p-4 dark:border-gray-800">
        {recording && (
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            Recording · {timer}
          </div>
        )}
        <p className="text-xs text-gray-400">Sidecar :9847</p>
      </div>
    </aside>
  );
}
