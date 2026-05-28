import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { invokeSafe } from "../lib/tauri";
import { applyTheme, storeTheme, type Theme } from "../lib/theme";

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

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [whisperModel, setWhisperModel] = useState("base.en");
  const [screenshotInterval, setScreenshotInterval] = useState("10");
  const [storagePath, setStoragePath] = useState("");
  const [theme, setTheme] = useState<Theme>("system");
  const [startMinimized, setStartMinimized] = useState(true);
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
        setTheme((s.theme as Theme) || "system");
        setStartMinimized(s.start_minimized !== "0");
        setCurrentPath(s.current_storage_path);
        setDefaultPath(s.default_storage_path);
      })
      .catch(() => setError("Could not load settings"));
  }, []);

  const handleThemeChange = (t: Theme) => {
    setTheme(t);
    storeTheme(t);
    applyTheme(t);
  };

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    try {
      await api.saveSettings({
        api_key: apiKey,
        whisper_model: whisperModel,
        screenshot_interval: screenshotInterval,
        storage_path: storagePath,
        theme,
        start_minimized: startMinimized ? "1" : "0",
      });
      storeTheme(theme);
      applyTheme(theme);
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
          Preferences stored locally · Ctrl+Shift+R toggles recording
        </p>
      </header>

      <div className="mx-auto w-full max-w-lg space-y-6 p-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </p>
        )}
        {saved && (
          <p className="rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent">
            Settings saved.
          </p>
        )}

        <section>
          <label className="mb-1.5 block text-sm font-medium">Appearance</label>
          <select
            value={theme}
            onChange={(e) => handleThemeChange(e.target.value as Theme)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            {THEMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </section>

        <section>
          <label className="mb-1.5 block text-sm font-medium">
            Claude API key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-…"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </section>

        <section>
          <label className="mb-1.5 block text-sm font-medium">
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
          <label className="mb-1.5 block text-sm font-medium">
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={startMinimized}
              onChange={(e) => setStartMinimized(e.target.checked)}
              className="rounded"
            />
            Start minimized to system tray
          </label>
        </section>

        <section>
          <label className="mb-1.5 block text-sm font-medium">
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
            Current: <code>{currentPath}</code>. Restart after changing.
          </p>
        </section>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
          >
            Save settings
          </button>
          <button
            type="button"
            onClick={() => void invokeSafe("show_main_window")}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700"
          >
            Show window
          </button>
        </div>
      </div>
    </div>
  );
}
