interface Props {
  message?: string;
  submessage?: string;
  error?: string | null;
  onRetry?: () => void;
}

export function LoadingScreen({
  message = "Starting Auris",
  submessage = "Loading Whisper and embedding models…",
  error,
  onRetry,
}: Props) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="mb-6 h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      <h1 className="text-lg font-semibold text-primary">Auris</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>
      <p className="mt-1 max-w-sm text-center text-xs text-gray-400">{submessage}</p>
      {error && (
        <div className="mt-6 max-w-md rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
          {error}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 block w-full rounded-md bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
