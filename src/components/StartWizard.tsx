"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Lightbulb, Inbox, Rocket, ArrowRight, Loader2 } from "lucide-react";

type TriageResult = {
  type: "IDEA" | "DEMAND" | "PROJECT";
  title: string;
  description: string;
  expectedOutcome: string | null;
  reasoning: string;
};

const TYPE_META = {
  IDEA: { label: "Idea", icon: Lightbulb, hint: "Goes to Ideation for brainstorming & feasibility" },
  DEMAND: { label: "Demand", icon: Inbox, hint: "Goes to the Demand backlog for triage/approval" },
  PROJECT: { label: "Project", icon: Rocket, hint: "Creates a real project, ready to plan" },
} as const;

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

// The single free-text alternative to picking Ideation / Demand / Project up front on /home --
// the person just describes what's on their mind, AI classifies + drafts it, they confirm (or
// override the classification) with one click. Renders open by default for a brand-new user
// with nothing created yet (autoOpen), and as a small manual "Not sure where to start?" trigger
// for everyone else -- same feature either way, just different starting visibility so it never
// gets in the way of someone who already knows exactly which of the three buttons they want.
export default function StartWizard({
  autoOpen,
  userName,
  userEmail,
}: {
  autoOpen: boolean;
  userName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [text, setText] = useState("");
  const [triaging, setTriaging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);

  async function triage() {
    if (!text.trim()) return;
    setTriaging(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/ai/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setTriaging(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? "Could not triage that — try rephrasing it.");
      return;
    }
    setResult(data);
  }

  async function confirmCreate() {
    if (!result) return;
    setCreating(true);
    setError(null);
    try {
      if (result.type === "DEMAND") {
        const res = await fetch("/api/demand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: result.title,
            description: result.description,
            expectedOutcome: result.expectedOutcome,
            requestedByName: userName,
            requestedByEmail: userEmail,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Could not submit the demand request.");
        router.push("/demand");
        return;
      }
      // IDEA and PROJECT both land as a project record -- the only difference is which stage
      // it starts in, and Ideation-stage is already the create endpoint's default, so both
      // paths call the same /api/projects POST. An Idea just doesn't get pushed any further.
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: result.title,
          description: result.description,
          problemStatement: result.type === "IDEA" ? result.description : undefined,
          ideationNotes: result.type === "IDEA" ? result.reasoning : undefined,
        }),
      });
      const created = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(created?.error ?? "Could not create that.");
      router.push(`/projects/${created.id}`);
    } catch (err) {
      setCreating(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function reset() {
    setText("");
    setResult(null);
    setError(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between gap-3 bg-white rounded-xl border border-dashed border-slate-200 hover:border-accent-300 hover:bg-accent-50/30 transition-colors px-4 py-3 mb-5 text-left"
      >
        <span className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
          <Sparkles size={16} className="text-accent-600" /> Not sure where to start? Just describe it.
        </span>
        <ArrowRight size={15} className="text-slate-400" />
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-accent-200/70 shadow-sm shadow-accent-100/50 p-5 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={16} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">What&apos;s on your mind?</p>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Describe it in your own words — a rough idea, a request that needs approval, or
        something ready to start. No need to know which one it is yet.
      </p>

      {!result && (
        <>
          <textarea
            className={`${inputCls} mb-2`}
            rows={3}
            placeholder="e.g. we should probably automate our invoicing at some point..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={triage}
              disabled={triaging || !text.trim()}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {triaging ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {triaging ? "Thinking..." : "Figure out what this is"}
            </button>
            {!autoOpen && (
              <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">
                Cancel
              </button>
            )}
          </div>
        </>
      )}

      {result && (
        <div>
          <p className="text-xs text-slate-500 mb-3">{result.reasoning}</p>
          <div className="flex items-center gap-1.5 mb-3">
            {(Object.keys(TYPE_META) as Array<keyof typeof TYPE_META>).map((t) => {
              const meta = TYPE_META[t];
              const Icon = meta.icon;
              const active = result.type === t;
              return (
                <button
                  key={t}
                  onClick={() => setResult({ ...result, type: t })}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${
                    active ? "bg-accent-50 border-accent-300 text-accent-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={13} /> {meta.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mb-3">{TYPE_META[result.type].hint}</p>

          <input
            className={`${inputCls} mb-2 font-medium`}
            value={result.title}
            onChange={(e) => setResult({ ...result, title: e.target.value })}
          />
          <textarea
            className={`${inputCls} mb-2`}
            rows={2}
            value={result.description}
            onChange={(e) => setResult({ ...result, description: e.target.value })}
          />
          {result.type === "DEMAND" && (
            <input
              className={`${inputCls} mb-2`}
              placeholder="What does success look like? (optional)"
              value={result.expectedOutcome ?? ""}
              onChange={(e) => setResult({ ...result, expectedOutcome: e.target.value })}
            />
          )}

          {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={confirmCreate}
              disabled={creating || !result.title.trim()}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
              {creating ? "Creating..." : `Create as ${TYPE_META[result.type].label}`}
            </button>
            <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600">
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
