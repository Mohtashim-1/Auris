import { useEffect, useState } from "react";
import { api, formatDate, type SearchResult } from "../lib/api";

export function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      api
        .search(query.trim())
        .then((r) => setResults(r.results))
        .catch((e) => setError(e instanceof Error ? e.message : "Search failed"))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h2 className="text-xl font-semibold">Search</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Semantic search across transcripts and screen context
        </p>
      </header>

      <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your memory…"
          className="w-full max-w-xl rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none ring-primary focus:ring-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <p className="text-sm text-gray-400">Searching…</p>
        )}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {!loading && query.length >= 2 && results.length === 0 && !error && (
          <p className="text-sm text-gray-400">No matches found.</p>
        )}
        {query.length < 2 && (
          <p className="text-sm text-gray-400">Type at least 2 characters.</p>
        )}
        <div className="mx-auto max-w-2xl space-y-3">
          {results.map((r) => (
            <article
              key={r.id}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-400">
                <span>
                  {r.session_title || "Session"} ·{" "}
                  {r.session_date ? formatDate(r.session_date) : ""}
                </span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
                  {r.type === "ocr" ? "Screen" : r.speaker || "Transcript"}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                {r.text}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Relevance {Math.round(r.score * 100)}%
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
