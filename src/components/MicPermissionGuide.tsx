export function MicPermissionGuide() {
  const platform =
    typeof navigator !== "undefined" && /Mac/.test(navigator.platform)
      ? "macos"
      : typeof navigator !== "undefined" && /Win/.test(navigator.platform)
        ? "windows"
        : "linux";

  const steps: Record<string, string[]> = {
    linux: [
      "Install PortAudio: sudo apt install portaudio19-dev",
      "Ensure your user is in the audio group: sudo usermod -aG audio $USER",
      "Check input device: arecord -l",
      "Restart Auris after granting permissions",
    ],
    macos: [
      "Open System Settings → Privacy & Security → Microphone",
      "Enable microphone access for Auris (or your terminal if running in dev)",
      "Quit and reopen the app",
    ],
    windows: [
      "Open Settings → Privacy → Microphone",
      "Turn on microphone access for desktop apps",
      "Allow Auris under app permissions",
    ],
  };

  return (
    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
      <p className="text-sm font-medium text-red-800 dark:text-red-200">
        Microphone unavailable
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-red-700 dark:text-red-300">
        {steps[platform].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
