import Link from "next/link";
import Topbar from "@/components/Topbar";
import KpiCard from "@/components/KpiCard";
import CategoryBar from "@/components/CategoryBar";
import { StageBadge, PriorityBadge } from "@/components/badges";
import { getAllProjectsWithMetrics } from "@/lib/portfolio";
import { getCurrentUser } from "@/lib/auth";
import { PlusCircle, Lightbulb } from "lucide-react";
import IdeaSuggestions from "@/components/IdeaSuggestions";
import ExportButtons from "@/components/ExportButtons";

export const dynamic = "force-dynamic";

const IDEATION_STAGES = ["INCEPTION", "IDEATION", "CHARTER"];

// Display order for the sub-stage breakdown chart -- the gated Plan sequence itself
// (see ideationSubStageEnum in schema.ts), not alphabetical, so the bar chart reads left to
// right as "further along the pipeline."
const SUB_STAGE_ORDER: { key: string; label: string }[] = [
  { key: "IDEA_ALIGNMENT", label: "Idea & Alignment" },
  { key: "TECHNICAL_FEASIBILITY", label: "Feasibility" },
  { key: "ARCHITECTURE_REVIEW", label: "Architecture" },
  { key: "CHARTER", label: "Charter" },
  { key: "RESOURCING_DECISION", label: "Resourcing" },
  { key: "READY_FOR_EXECUTION", label: "Ready" },
];

export default async function IdeationPage() {
  const user = await getCurrentUser();
  const all = await getAllProjectsWithMetrics(user);
  const ideas = all
    .filter((p) => IDEATION_STAGES.includes(p.stage))
    .sort((a, b) => IDEATION_STAGES.indexOf(a.stage) - IDEATION_STAGES.indexOf(b.stage));

  // Summary layer on top of the same list below -- same relationship as /dashboard sits on
  // top of /projects, just scoped to ideation-stage projects instead of the whole portfolio.
  const readyForExecutionCount = ideas.filter((p) => p.ideationSubStage === "READY_FOR_EXECUTION").length;
  const quickWinCount = ideas.filter((p) => p.roadmapStatus?.quickWin).length;
  const scored = ideas.filter((p) => p.feasibilityScore != null);
  const avgFeasibility = scored.length === 0 ? null : Math.round(scored.reduce((s, p) => s + (p.feasibilityScore ?? 0), 0) / scored.length);
  const subStageData = SUB_STAGE_ORDER.map(({ key, label }) => ({
    label,
    count: ideas.filter((p) => p.ideationSubStage === key).length,
  }));

  return (
    <div>
      <Topbar
        title="Ideation"
        subtitle="Idea generation, feasibility, estimates, charter, and approval — before a project moves into execution"
        action={
          <div className="flex items-center gap-2">
            <ExportButtons endpoint="/api/reports/ideation" filenamePrefix="ideation" />
            <Link
              href="/projects/new?intent=idea"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700"
            >
              <PlusCircle size={16} />
              New Idea
            </Link>
          </div>
        }
      />
      <div className="p-8 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Ideas in Pipeline" value={ideas.length} />
          <KpiCard label="Ready for Execution" value={readyForExecutionCount} tone={readyForExecutionCount > 0 ? "good" : "default"} />
          <KpiCard label="Roadmap Quick Wins" value={quickWinCount} tone={quickWinCount > 0 ? "good" : "default"} />
          <KpiCard label="Avg Feasibility Score" value={avgFeasibility ?? "—"} hint={scored.length === 0 ? "No scores yet" : `${scored.length} scored`} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4">
          <p className="text-sm font-semibold text-slate-900 mb-1">Pipeline by Stage</p>
          <CategoryBar data={subStageData} />
        </div>

        <div className="rounded-xl border border-accent-100 bg-accent-50/60 px-5 py-4 flex items-start gap-3">
          <Lightbulb size={18} className="text-accent-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-accent-900 mb-1">How ideation works</p>
            <p className="text-xs text-accent-800 leading-relaxed">
              Every idea starts here — brainstorm and align on what to take forward, get an AI technical
              feasibility read, generate a cost/schedule estimate, build the project charter, then approve
              it. Once approved, it moves to Project Execution and you continue with the same record — nothing
              gets re-entered. Open any idea below to work through its steps (in the project&apos;s Charter tab).
            </p>
          </div>
        </div>

        <IdeaSuggestions />

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-2.5 font-medium">Idea / Project</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Sponsor</th>
                <th className="px-4 py-2.5 font-medium">Estimated Budget</th>
                <th className="px-4 py-2.5 font-medium">Roadmap</th>
              </tr>
            </thead>
            <tbody>
              {ideas.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-accent-600">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><StageBadge stage={p.stage} /></td>
                  <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                  <td className="px-4 py-3 text-slate-600">{p.sponsor ?? "—"}</td>
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
              {ideas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No ideas in progress. Start one with &quot;New Idea&quot; above.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
