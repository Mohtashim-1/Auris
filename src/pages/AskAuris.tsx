import { useRef, useState } from "react";
import { ChatMessage, type ChatMessageData } from "../components/ChatMessage";
import { api, type ChatCitation } from "../lib/api";

export function AskAuris() {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollDown = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);
    const userMsg: ChatMessageData = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let assistantContent = "";
    let citations: ChatCitation[] = [];

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", citations: [] },
    ]);

    try {
      for await (const chunk of api.chatStream(text, history.slice(0, -1))) {
        if (chunk.type === "citations" && Array.isArray(chunk.citations)) {
          citations = chunk.citations as ChatCitation[];
        } else if (chunk.type === "token" && typeof chunk.text === "string") {
          assistantContent += chunk.text;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              role: "assistant",
              content: assistantContent,
              citations,
            };
            return next;
          });
          scrollDown();
        } else if (chunk.type === "error") {
          throw new Error(String(chunk.message));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
      scrollDown();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h2 className="text-xl font-semibold">Ask Auris</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Chat with your conversation and screen memory
        </p>
      </header>

      {!error && messages.length === 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          Add your Claude API key in Settings to enable AI chat.
        </div>
      )}

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400">
            Ask anything about what Auris heard or saw.
          </p>
        )}
        {messages.map((m, i) => (
          <ChatMessage key={i} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 p-4 dark:border-gray-800">
        <form
          className="mx-auto flex max-w-2xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            placeholder="Ask a question…"
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none ring-primary focus:ring-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {streaming ? "…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
