import { formatTime, type TranscriptLine as Line } from "../lib/api";

interface Props {
  line: Line;
}

const SPEAKER_COLORS = [
  "bg-primary/15 text-primary",
  "bg-accent/15 text-accent",
  "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "bg-violet-500/15 text-violet-700 dark:text-violet-400",
];

function speakerColor(speaker: string): string {
  const n = parseInt(speaker.replace(/\D/g, ""), 10) || 1;
  return SPEAKER_COLORS[(n - 1) % SPEAKER_COLORS.length];
}

export function TranscriptLine({ line }: Props) {
  return (
    <div className="flex gap-3 border-b border-gray-100 px-1 py-3 dark:border-gray-800/80">
      <span
        className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${speakerColor(line.speaker)}`}
      >
        {line.speaker}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2 text-xs text-gray-400">
          <time dateTime={line.started_at}>{formatTime(line.started_at)}</time>
          {line.confidence > 0 && (
            <span>{Math.round(line.confidence * 100)}%</span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">
          {line.text}
        </p>
      </div>
    </div>
  );
}
