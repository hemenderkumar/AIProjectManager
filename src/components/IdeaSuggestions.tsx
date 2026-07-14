"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ArrowRight, X } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";

type IdeaSuggestion = {
  name: string;
  ideaType: "OPPORTUNITY" | "PROBLEM";
  problemStatement: string;
  proposedSolution: string;
  expectedBenefits: string;
  rationale: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

const TYPE_LABEL: Record<IdeaSuggestion["ideaType"], string> = {
  OPPORTUNITY: "Opportunity",
  PROBLEM: "Problem to solve",
};

// Lets a PM generate new idea drafts from the portfolio instead of typing every idea by hand —
// "Use this idea" creates the project record directly (stage: IDEATION) and jumps straight in.
export default function IdeaSuggestions() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<IdeaSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingIndex, setCreatingIndex] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  async function suggest() {
    setLoading(true);
    setError(null);
    setDismissed(new Set());
    try {
      const res = await fetch("/api/ai/suggest-ideas", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data?.ideas)) {
        setError(data?.error ?? "Couldn't generate suggestions right now.");
        return;
      }
      setIdeas(data.ideas);
    } finally {
      setLoading(false);
    }
  }

  async function createFromIdea(idea: IdeaSuggestion, index: number) {
    setCreatingIndex(index);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: idea.name,
          stage: "IDEATION",
          priority: idea.priority,
          ideaType: idea.ideaType,
          problemStatement: idea.problemStatement,
          proposedSolution: idea.proposedSolution,
          expectedBenefits: idea.expectedBenefits,
          ideationNotes: `AI-suggested: ${idea.rationale}`,
        }),
      });
      const created = await res.json();
      if (created?.id) {
        router.push(`/projects/${created.id}`);
      }
    } finally {
      setCreatingIndex(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Need ideas?</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Let AI scan your portfolio and suggest new project ideas — pick one to start it instantly.
          </p>
        </div>
        <button
          onClick={suggest}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700 disabled:opacity-50 shrink-0"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {loading ? "Thinking..." : ideas ? "Suggest more" : "Suggest Ideas with AI"}
        </button>
      </div>

      <AiWaitIndicator active={loading} messages={["Scanning your portfolio...", "Drafting new ideas..."]} />
      {error && <p className="text-xs text-rose-600">{error}</p>}

      {ideas && ideas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ideas.map((idea, i) =>
            dismissed.has(i) ? null : (
              <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-2 relative">
                <button
                  onClick={() => setDismissed((prev) => new Set(prev).add(i))}
                  className="absolute top-2 right-2 text-slate-300 hover:text-slate-500"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
                <div className="flex items-center gap-2 pr-4">
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                    {TYPE_LABEL[idea.ideaType]}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">{idea.priority}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">{idea.name}</p>
                <p className="text-xs text-slate-600">{idea.problemStatement}</p>
                <p className="text-xs text-slate-500">
                  <span className="font-medium text-slate-600">Proposed: </span>
                  {idea.proposedSolution}
                </p>
                <p className="text-[11px] text-slate-400 italic">Why: {idea.rationale}</p>
                <button
                  onClick={() => createFromIdea(idea, i)}
                  disabled={creatingIndex !== null}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 font-medium mt-1"
                >
                  {creatingIndex === i ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <ArrowRight size={12} />
                  )}
                  {creatingIndex === i ? "Creating..." : "Use this idea"}
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
