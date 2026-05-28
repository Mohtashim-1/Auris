const SIDECAR_BASE = "http://127.0.0.1:9847";

export interface StatusResponse {
  ok: boolean;
  recording: boolean;
  session_id: string | null;
  models_ready: boolean;
  model_error: string | null;
  whisper_model: string;
  has_api_key: boolean;
  api_version?: number;
  audio_level?: number;
}

export interface StatsResponse {
  session_count: number;
  transcript_line_count: number;
  screen_capture_count: number;
  open_action_items: number;
  total_duration_seconds: number;
  storage_bytes: number;
  memory_vectors: number;
  data_path: string;
}

export const MIN_API_VERSION = 4;

export interface TranscriptLine {
  id: string;
  session_id: string;
  speaker: string;
  text: string;
  started_at: string;
  confidence: number;
}

export interface SessionSummary {
  id: string;
  started_at: string;
  ended_at: string | null;
  title: string | null;
  summary: string | null;
  duration_seconds: number | null;
  action_item_count: number;
}

export interface ActionItem {
  id: string;
  text: string;
  done: number;
  created_at: string;
}

export interface ScreenCapture {
  id: string;
  ocr_text: string;
  captured_at: string;
}

export interface SessionDetail extends SessionSummary {
  transcript: TranscriptLine[];
  action_items: ActionItem[];
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  session_id: string;
  speaker: string;
  timestamp: string;
  type: string;
  session_title: string | null;
  session_date: string | null;
}

export interface ChatCitation {
  session_id: string;
  label: string;
  date: string;
}

export interface SettingsResponse {
  api_key: string | null;
  whisper_model: string | null;
  screenshot_interval: string | null;
  storage_path: string | null;
  theme: string | null;
  start_minimized: string | null;
  auto_record_on_launch: string | null;
  retention_days: string | null;
  onboarding_complete: string | null;
  ocr_mode: string | null;
  has_api_key?: boolean;
  default_storage_path: string;
  current_storage_path: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SIDECAR_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : res.statusText;
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getStatus: () => request<StatusResponse>("/status"),

  getStats: () => request<StatsResponse>("/stats"),

  isSidecarReachable: async (): Promise<boolean> => {
    try {
      await api.getStatus();
      return true;
    } catch {
      return false;
    }
  },

  startRecording: () =>
    request<{ session_id: string; status: string }>("/recording/start", {
      method: "POST",
    }),

  stopRecording: () =>
    request<{ session_id: string | null; status: string }>("/recording/stop", {
      method: "POST",
    }),

  retryModels: () =>
    request<{ models_ready: boolean; model_error: string | null }>(
      "/models/retry",
      { method: "POST" }
    ),

  listSessions: () => request<SessionSummary[]>("/sessions"),

  getSession: (id: string) => request<SessionDetail>(`/sessions/${id}`),

  deleteSession: (id: string) =>
    request<{ deleted: string }>(`/sessions/${id}`, { method: "DELETE" }),

  renameSession: (id: string, title: string) =>
    request<{ id: string; title: string }>(`/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),

  purgeData: (mode: "all" | "retention", days = 30) =>
    request<{ deleted_sessions: number; mode: string }>("/data/purge", {
      method: "POST",
      body: JSON.stringify({ mode, days }),
    }),

  summarizeSession: (id: string) =>
    request<{ status: string; session_id: string }>(`/sessions/${id}/summarize`, {
      method: "POST",
    }),

  exportSession: async (id: string, format: "md" | "txt" = "md") => {
    const res = await fetch(
      `${SIDECAR_BASE}/sessions/${id}/export?format=${format}`
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail =
        typeof body === "object" && body && "detail" in body
          ? String((body as { detail: unknown }).detail)
          : res.status === 404
            ? "Route not found — restart Auris to load the latest sidecar"
            : "Export failed";
      throw new Error(detail);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auris-session-${id.slice(0, 8)}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  },

  search: (q: string, n = 10) =>
    request<{ results: SearchResult[]; query: string }>(
      `/search?q=${encodeURIComponent(q)}&n=${n}`
    ),

  getSettings: () => request<SettingsResponse>("/settings"),

  saveSettings: (settings: Record<string, string>) =>
    request<{ saved: string[]; has_api_key?: boolean }>("/settings", {
      method: "POST",
      body: JSON.stringify({ settings }),
    }),

  toggleActionItem: (id: string, done: boolean) =>
    request<{ id: string; done: boolean }>(`/action-items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    }),

  streamUrl: () => `${SIDECAR_BASE}/stream`,

  chatStream: async function* (
    message: string,
    history: { role: string; content: string }[]
  ): AsyncGenerator<Record<string, unknown>> {
    const res = await fetch(`${SIDECAR_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        typeof body === "object" && body && "detail" in body
          ? String((body as { detail: unknown }).detail)
          : res.statusText
      );
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6)) as Record<string, unknown>;
          } catch {
            /* skip */
          }
        }
      }
    }
  },
};

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function isMicError(message: string): boolean {
  return /microphone|unavailable|permission|portaudio|pyaudio/i.test(message);
}
