"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ArrowRight, RefreshCw } from "lucide-react";

type IncidentPattern = {
  name: string;
  count: number;
  incidentTitles: string[];
  projects: string[];
  summary: string;
  ideaType: "PROBLEM";
  problemStatement: string;
  proposedSolution: string;
  expectedBenefits: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

// A dedicated review view (opened whenever someone checks it -- no scheduling required) for
// converting recurring support incidents into systematic improvement projects, instead of
// each incident just getting resolved and forgotten one at a time. "Convert to Improvement
// Project" creates the project record directly (stage: IDEATION, ideaType: PROBLEM) so it
// flows into Keel's existing Ideation -> Charter -> Execution pipeline.
export default function IncidentPatterns() {
  const router = useRouter();
  const [patterns, setPatterns] = useState<IncidentPattern[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingIndex, setCreatingIndex] = useState<number | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/incident-patterns", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data?.patterns)) {
        setError(data?.error ?? "Couldn't analyze incidents right now.");
        return;
      }
      setPatterns(data.patterns);
    } finally {
      setLoading(false);
    }
  }

  async function convertToProject(pattern: IncidentPattern, index: number) {
    setCreatingIndex(index);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pattern.name,
          stage: "IDEATION",
          priority: pattern.priority,
          ideaType: pattern.ideaType,
          problemStatement: pattern.problemStatement,
          proposedSolution: pattern.proposedSolution,
          expectedBenefits: pattern.expectedBenefits,
          ideationNotes: `Converted from a recurring incident pattern (${pattern.count} incidents): ${pattern.incidentTitles.join("; ")}`,
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
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Incident Patterns</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Let AI scan every logged incident for recurring root causes, then convert the systematic ones
            into improvement projects instead of resolving each ticket in isolation.
          </p>
        </div>
        <button
          onClick={analyze}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700 disabled:opacity-50 shrink-0"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : patterns ? <RefreshCw size={15} /> : <Sparkles size={15} />}
          {loading ? "Analyzing..." : patterns ? "Re-analyze" : "Analyze for Patterns"}
        </button>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {patterns && patterns.length === 0 && (
        <p className="text-xs text-slate-400 px-1">
          No recurring patterns found — either there isn&apos;t enough incident history yet, or nothing has
          genuinely repeated.
        </p>
      )}

      {patterns && patterns.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {patterns.map((pattern, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-50 text-rose-600">
                  {pattern.count}x recurring
                </span>
                <span className="text-[10px] font-medium text-slate-400">{pattern.priority}</span>
              </div>
              <p className="text-sm font-semibold text-slate-900">{pattern.name}</p>
              <p className="text-xs text-slate-600">{pattern.summary}</p>
              <p className="text-[11px] text-slate-400">
                <span className="font-medium text-slate-500">Incidents: </span>
                {pattern.incidentTitles.join("; ")}
              </p>
              {pattern.projects.length > 0 && (
                <p className="text-[11px] text-slate-400">
                  <span className="font-medium text-slate-500">Projects: </span>
                  {pattern.projects.join(", ")}
                </p>
              )}
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-600">Proposed fix: </span>
                {pattern.proposedSolution}
              </p>
              <button
                onClick={() => convertToProject(pattern, i)}
                disabled={creatingIndex !== null}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 font-medium mt-1"
              >
                {creatingIndex === i ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                {creatingIndex === i ? "Creating..." : "Convert to Improvement Project"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
