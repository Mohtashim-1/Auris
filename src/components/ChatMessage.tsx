import type { ChatCitation } from "../lib/api";

export interface ChatMessageData {
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
}

interface Props {
  message: ChatMessageData;
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";
  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
          isUser
            ? "bg-primary text-white"
            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
        }`}
      >
        {message.content || (isUser ? "" : "…")}
      </div>
      {!isUser && message.citations && message.citations.length > 0 && (
        <ul className="mt-1.5 max-w-[85%] space-y-0.5 text-xs text-gray-400">
          {message.citations.map((c) => (
            <li key={c.session_id}>
              Based on your session from {c.date || c.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
