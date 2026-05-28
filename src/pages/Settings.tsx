import { useEffect, useState } from "react";
import { api } from "../lib/api";

const WHISPER_MODELS = [
  { value: "tiny.en", label: "Tiny (fastest)" },
  { value: "base.en", label: "Base (default)" },
  { value: "small.en", label: "Small (more accurate)" },
];

const SCREENSHOT_INTERVALS = [
  { value: "0", label: "Off" },
  { value: "5", label: "Every 5 seconds" },
  { value: "10", label: "Every 10 seconds" },
  { value: "30", label: "Every 30 seconds" },
];

export function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [whisperModel, setWhisperModel] = useState("base.en");
  const [screenshotInterval, setScreenshotInterval] = useState("10");
  const [storagePath, setStoragePath] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [defaultPath, setDefaultPath] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setApiKey(s.api_key ?? "");
        setWhisperModel(s.whisper_model ?? "base.en");
        setScreenshotInterval(s.screenshot_interval ?? "10");
        setStoragePath(s.storage_path ?? "");
        setCurrentPath(s.current_storage_path);
        setDefaultPath(s.default_storage_path);
      })
      .catch(() => setError("Could not load settings"));
  }, []);

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    try {
      await api.saveSettings({
        api_key: apiKey,
        whisper_model: whisperModel,
        screenshot_interval: screenshotInterval,
        storage_path: storagePath,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          API key and preferences (stored locally)
        </p>
      </header>

      <div className="mx-auto w-full max-w-lg space-y-6 p-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </p>
        )}
        {saved && (
          <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent dark:text-accent">
            Settings saved.
          </p>
        )}

        <section>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Claude API key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-…"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
          <p className="mt-1 text-xs text-gray-400">
            Used only for summarization and chat — sent directly to Anthropic.
          </p>
        </section>

        <section>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Whisper model
          </label>
          <select
            value={whisperModel}
            onChange={(e) => setWhisperModel(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            {WHISPER_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </section>

        <section>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Screenshot OCR interval
          </label>
          <select
            value={screenshotInterval}
            onChange={(e) => setScreenshotInterval(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            {SCREENSHOT_INTERVALS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </section>

        <section>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Storage location
          </label>
          <input
            type="text"
            value={storagePath}
            onChange={(e) => setStoragePath(e.target.value)}
            placeholder={defaultPath}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
          <p className="mt-1 text-xs text-gray-400">
            Current: <code className="text-xs">{currentPath}</code>. Leave empty
            for default. Restart app after changing.
          </p>
        </section>

        <button
          type="button"
          onClick={() => void handleSave()}
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
        >
          Save settings
        </button>
      </div>
    </div>
  );
}
