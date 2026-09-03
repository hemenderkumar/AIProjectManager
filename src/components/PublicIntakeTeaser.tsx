"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Lightbulb, Inbox, Rocket, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

type TriageResult = {
  type: "IDEA" | "DEMAND" | "PROJECT";
  title: string;
  description: string;
  expectedOutcome: string | null;
  reasoning: string;
};

const TYPE_META = {
  IDEA: { label: "Idea", icon: Lightbulb },
  DEMAND: { label: "Demand", icon: Inbox },
  PROJECT: { label: "Project", icon: Rocket },
} as const;

export const PENDING_INTAKE_KEY = "executa_pending_intake";

// The public, no-login sibling of the in-app "What's on your mind?" wizard (StartWizard) --
// lives on the logged-out marketing homepage so a visitor can watch Executa actually classify
// their own idea before they've created an account, instead of just reading a claim about it.
// Calls /api/public/triage (rate-limited by IP, no auth). What happens next depends on the
// classification: a Demand can be submitted right here, no account needed, same as the
// existing /demand-request page. An Idea or Project needs a real org to live in, so instead the
// result is stashed in sessionStorage and the visitor is sent to /register -- StartWizard picks
// that stashed result back up the first time it mounts after they log in, so nothing they typed
// is lost to the signup detour.
export default function PublicIntakeTeaser() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [triaging, setTriaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);

  // Demand-specific inline capture (mirrors /demand-request, which is already public/no-login).
  const [demandName, setDemandName] = useState("");
  const [demandEmail, setDemandEmail] = useState("");
  const [submittingDemand, setSubmittingDemand] = useState(false);
  const [demandSubmitted, setDemandSubmitted] = useState(false);

  async function triage() {
    if (!text.trim()) return;
    setTriaging(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/public/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setTriaging(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? "Could not classify that — try rephrasing it.");
      return;
    }
    setResult(data);
  }

  async function submitDemand() {
    if (!result || !demandName.trim() || !demandEmail.trim()) return;
    setSubmittingDemand(true);
    setError(null);
    try {
      const res = await fetch("/api/demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          description: result.description,
          expectedOutcome: result.expectedOutcome,
          requestedByName: demandName,
          requestedByEmail: demandEmail,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Could not submit that.");
      setDemandSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmittingDemand(false);
    }
  }

  function continueToSignup() {
    if (!result) return;
    try {
      sessionStorage.setItem(PENDING_INTAKE_KEY, JSON.stringify(result));
    } catch {
      // sessionStorage can throw in locked-down browser contexts -- signup still works,
      // it just won't be pre-filled.
    }
    router.push("/register");
  }

  if (demandSubmitted) {
    return (
      <div className="w-full max-w-lg mx-auto bg-white rounded-xl border border-emerald-200 shadow-sm p-6 text-center">
        <CheckCircle2 size={24} className="text-emerald-600 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-900 mb-1">Request submitted</p>
        <p className="text-xs text-slate-500">
          Thanks — this lands in the demand backlog for triage. No account needed, and you&apos;ll
          hear back at {demandEmail}.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto bg-white rounded-xl border border-accent-200/70 shadow-sm shadow-accent-100/50 p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={16} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Try it — describe what&apos;s on your mind</p>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        A rough idea, a request, or something ready to start — Executa figures out which one it is.
        No account needed to try it.
      </p>

      {!result && (
        <>
          <textarea
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500 mb-2"
            rows={3}
            placeholder="e.g. we should probably automate our invoicing at some point..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={600}
          />
          {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
          <button
            onClick={triage}
            disabled={triaging || !text.trim()}
            className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {triaging ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {triaging ? "Thinking..." : "Show me what Executa would do"}
          </button>
        </>
      )}

      {result && (
        <div>
          <p className="text-xs text-slate-500 mb-3">{result.reasoning}</p>
          <div className="flex items-center gap-1.5 mb-3">
            {(() => {
              const meta = TYPE_META[result.type];
              const Icon = meta.icon;
              return (
                <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border bg-accent-50 border-accent-300 text-accent-700">
                  <Icon size={13} /> {meta.label}
                </span>
              );
            })()}
          </div>
          <p className="text-sm font-semibold text-slate-900 mb-1">{result.title}</p>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">{result.description}</p>

          {result.type === "DEMAND" ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">
                Submit this now — no account needed, same as our{" "}
                <a href="/demand-request" className="text-accent-600 hover:text-accent-700">demand request form</a>.
              </p>
              <input
                placeholder="Your name"
                value={demandName}
                onChange={(e) => setDemandName(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
              <input
                type="email"
                placeholder="Your email"
                value={demandEmail}
                onChange={(e) => setDemandEmail(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={submitDemand}
                  disabled={submittingDemand || !demandName.trim() || !demandEmail.trim()}
                  className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
                >
                  {submittingDemand ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                  {submittingDemand ? "Submitting..." : "Submit this demand"}
                </button>
                <button onClick={() => setResult(null)} className="text-xs text-slate-400 hover:text-slate-600">
                  Try another
                </button>
              </div>
            </div>
          ) : (
            <div>
              {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={continueToSignup}
                  className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700"
                >
                  <ArrowRight size={13} /> Create a free account to start this
                </button>
                <button onClick={() => setResult(null)} className="text-xs text-slate-400 hover:text-slate-600">
                  Try another
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Takes 30 seconds — what you typed carries over, nothing is lost.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
