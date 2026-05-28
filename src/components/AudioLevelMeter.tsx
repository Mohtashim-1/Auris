interface Props {
  level: number;
}

export function AudioLevelMeter({ level }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, level)) * 100);
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs text-gray-400">
        <span>Microphone level</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className="h-full rounded-full bg-accent transition-all duration-75"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
