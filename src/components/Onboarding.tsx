import { useState } from "react";
import { api } from "../lib/api";

interface Props {
  hasApiKey: boolean;
  onComplete: () => void;
}

const STEPS = [
  {
    title: "Welcome to Auris",
    body: "Auris listens in the background, transcribes speech locally with Whisper, and remembers what you see on screen.",
  },
  {
    title: "Your privacy",
    body: "Audio is processed on your machine. Only Claude API calls (summaries & chat) leave your device, and only when you add an API key.",
  },
  {
    title: "Quick start",
    body: "Press Start listening on Today, or use Ctrl+Shift+R anywhere. Auris runs in the system tray when minimized.",
  },
];

export function Onboarding({ hasApiKey, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");

  const finish = async (saveKey: boolean) => {
    const settings: Record<string, string> = { onboarding_complete: "1" };
    if (saveKey && apiKey.trim()) {
      settings.api_key = apiKey.trim();
    }
    await api.saveSettings(settings);
    localStorage.setItem("auris-onboarding-done", "1");
    onComplete();
  };

  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
        <p className="text-xs font-medium text-accent">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 className="mt-2 text-xl font-semibold">{STEPS[step].title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {STEPS[step].body}
        </p>

        {isLast && !hasApiKey && (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Claude API key (optional)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
        )}

        <div className="mt-6 flex justify-between gap-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Back
            </button>
          ) : (
            <span />
          )}
          {!isLast ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void finish(!!apiKey.trim())}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white"
            >
              Get started
            </button>
          )}
        </div>
        {isLast && (
          <button
            type="button"
            onClick={() => void finish(false)}
            className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600"
          >
            Skip API key for now
          </button>
        )}
      </div>
    </div>
  );
}
