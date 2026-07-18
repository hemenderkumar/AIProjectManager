"use client";
import { useState } from "react";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, inputCls } from "./ui";
import { Send, Loader2, Sparkles, User } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";

type Turn = { question: string; answer: string };

// Project-scoped Q&A — grounded in this one project's charter, tasks, risks, milestones,
// comms, SOWs, and deliverables (POST /api/ai/project-chat). Conversation history lives only
// in this component's state, refreshed from scratch every question rather than persisted —
// simplest thing that works for "what's blocking X" type lookups without adding a chat-history
// table to the schema.
export default function QaTab({ detail }: { detail: ProjectDetail }) {
  const projectId = detail.project.id;
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/project-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, question: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't get an answer right now.");
        return;
      }
      setTurns((prev) => [...prev, { question: q, answer: data.answer }]);
      setQuestion("");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card title="Ask about this project">
        <p className="text-xs text-slate-400 mb-3">
          Answers are grounded only in this project&apos;s own charter, tasks, risks, milestones,
          communications, SOWs, and deliverables — e.g. &quot;what&apos;s blocking the next milestone?&quot; or
          &quot;summarize open risks for the steering committee&quot;.
        </p>

        <div className="space-y-4 mb-4">
          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded-full bg-slate-100 text-slate-500 p-1"><User size={12} /></span>
                <p className="text-sm text-slate-800">{t.question}</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded-full bg-accent-50 text-accent-600 p-1"><Sparkles size={12} /></span>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{t.answer}</p>
              </div>
            </div>
          ))}
          {turns.length === 0 && !asking && (
            <p className="text-sm text-slate-400 text-center py-6">Ask your first question below.</p>
          )}
        </div>

        <AiWaitIndicator active={asking} messages={["Reading the project...", "Working out the answer..."]} className="mb-2" />
        {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}

        <div className="flex items-center gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !asking) ask();
            }}
            placeholder="e.g. What's blocking the next milestone?"
            className={inputCls}
            disabled={asking}
          />
          <button
            onClick={ask}
            disabled={asking || !question.trim()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 disabled:opacity-50 text-sm font-medium shrink-0"
          >
            {asking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </Card>
    </div>
  );
}
