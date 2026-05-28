import { formatDuration, type SessionSummary } from "../lib/api";

interface Props {
  session: SessionSummary;
  onClick: () => void;
}

export function SessionCard({ session, onClick }: Props) {
  const date = session.started_at
    ? new Date(session.started_at).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "Unknown date";

  const title = session.title || "Untitled session";
  const duration =
    session.duration_seconds != null
      ? formatDuration(session.duration_seconds)
      : "—";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
    >
      <p className="text-xs text-gray-400">{date}</p>
      <h3 className="mt-1 font-medium text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      <div className="mt-2 flex gap-3 text-xs text-gray-500">
        <span>{duration}</span>
        {session.action_item_count > 0 && (
          <span>{session.action_item_count} action items</span>
        )}
      </div>
    </button>
  );
}
