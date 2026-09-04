"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import KpiCard from "@/components/KpiCard";
import CategoryBar from "@/components/CategoryBar";
import DivisionFilterSelect from "@/components/DivisionFilterSelect";
import { StageBadge, PriorityBadge } from "@/components/badges";

const SUB_STAGE_ORDER: { key: string; label: string }[] = [
  { key: "IDEA_ALIGNMENT", label: "Idea & Alignment" },
  { key: "TECHNICAL_FEASIBILITY", label: "Feasibility" },
  { key: "ARCHITECTURE_REVIEW", label: "Architecture" },
  { key: "CHARTER", label: "Charter" },
  { key: "RESOURCING_DECISION", label: "Resourcing" },
  { key: "READY_FOR_EXECUTION", label: "Ready" },
];

type Idea = {
  id: string;
  name: string;
  stage: string;
  priority: string;
  sponsor: string | null;
  budgetPlanned: number | null;
  ideationSubStage: string | null;
  feasibilityScore: number | null;
  divisionId: string | null;
  divisionName: string | null;
  roadmapStatus: { quickWin: boolean; rationale: string | null } | null;
};

// Everything below the "How ideation works" banner that needs to react to the division
// filter -- KPI tiles, the sub-stage chart, and the table -- lives here as a client component
// so picking a division doesn't need a full page round-trip. The server page (page.tsx) does
// the actual data fetch + division-resolution (attachDivisionInfo) and just hands the
// already-annotated list down.
export default function IdeationDashboardClient({ ideas, divisionOptions }: { ideas: Idea[]; divisionOptions: { id: string; name: string }[] }) {
  const [division, setDivision] = useState("ALL");

  const filtered = useMemo(
    () => (division === "ALL" ? ideas : ideas.filter((p) => p.divisionId === division)),
    [ideas, division]
  );

  const readyForExecutionCount = filtered.filter((p) => p.ideationSubStage === "READY_FOR_EXECUTION").length;
  const quickWinCount = filtered.filter((p) => p.roadmapStatus?.quickWin).length;
  const scored = filtered.filter((p) => p.feasibilityScore != null);
  const avgFeasibility = scored.length === 0 ? null : Math.round(scored.reduce((s, p) => s + (p.feasibilityScore ?? 0), 0) / scored.length);
  const subStageData = SUB_STAGE_ORDER.map(({ key, label }) => ({
    label,
    count: filtered.filter((p) => p.ideationSubStage === key).length,
  }));

  return (
    <>
      {divisionOptions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-3 flex items-center gap-2">
          <span className="text-xs text-slate-500">Division:</span>
          <DivisionFilterSelect value={division} onChange={setDivision} divisions={divisionOptions} />
          {division !== "ALL" && (
            <button onClick={() => setDivision("ALL")} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ideas in Pipeline" value={filtered.length} />
        <KpiCard label="Ready for Execution" value={readyForExecutionCount} tone={readyForExecutionCount > 0 ? "good" : "default"} />
        <KpiCard label="Roadmap Quick Wins" value={quickWinCount} tone={quickWinCount > 0 ? "good" : "default"} />
        <KpiCard label="Avg Feasibility Score" value={avgFeasibility ?? "—"} hint={scored.length === 0 ? "No scores yet" : `${scored.length} scored`} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4">
        <p className="text-sm font-semibold text-slate-900 mb-1">Pipeline by Stage</p>
        <CategoryBar data={subStageData} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-2.5 font-medium">Idea / Project</th>
              <th className="px-4 py-2.5 font-medium">Stage</th>
              <th className="px-4 py-2.5 font-medium">Priority</th>
              <th className="px-4 py-2.5 font-medium">Sponsor</th>
              <th className="px-4 py-2.5 font-medium">Division</th>
              <th className="px-4 py-2.5 font-medium">Estimated Budget</th>
              <th className="px-4 py-2.5 font-medium">Roadmap</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-accent-600">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3"><StageBadge stage={p.stage} /></td>
                <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                <td className="px-4 py-3 text-slate-600">{p.sponsor ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{p.divisionName ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">${(p.budgetPlanned ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3">
                  {p.roadmapStatus ? (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        p.roadmapStatus.quickWin
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                      title={p.roadmapStatus.rationale ?? undefined}
                    >
                      {p.roadmapStatus.quickWin ? "Quick win" : "Longer-term"}
                    </span>
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {ideas.length === 0 ? 'No ideas in progress. Start one with "New Idea" above.' : "No ideas match this division."}
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
