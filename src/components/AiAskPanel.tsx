"use client";
import { useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";

const SUGGESTIONS = [
  "Which projects need my attention this week?",
  "Summarize portfolio budget health",
  "What are the top 3 risks across all projects?",
];

export default function AiAskPanel() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setAnswer(data.answer);
    } catch {
      setAnswer("Something went wrong asking the AI assistant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Ask the portfolio assistant</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about your projects..."
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 mt-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setQuestion(s);
              ask(s);
            }}
            className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            {s}
          </button>
        ))}
      </div>

      {answer && (
        <div className="mt-4 text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap border border-slate-100 max-h-80 overflow-y-auto scrollbar-thin">
          {answer}
        </div>
      )}
    </div>
  );
}
