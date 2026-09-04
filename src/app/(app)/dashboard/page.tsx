import Link from "next/link";
import Topbar from "@/components/Topbar";
import KpiCard from "@/components/KpiCard";
import RagPie from "@/components/RagPie";
import StageBar from "@/components/StageBar";
import AiAskPanel from "@/components/AiAskPanel";
import AiInsightsPanel from "@/components/AiInsightsPanel";
import ExportButtons from "@/components/ExportButtons";
import { RagBadge, StageBadge, PriorityBadge } from "@/components/badges";
import { getPortfolioSummary } from "@/lib/portfolio";
import { computeInsights } from "@/lib/insights";
import { getCurrentUser } from "@/lib/auth";
import { listDemand } from "@/lib/demand";
import { Lightbulb, Inbox, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

// Mirrors the stage set ideation/page.tsx treats as "still in the ideation funnel" (before a
// project reaches execution) -- kept here too since the dashboard needs the same slice of
// summary.projects without a second DB round-trip.
const IDEATION_STAGES = ["INCEPTION", "IDEATION", "CHARTER"];
// Mirrors OPEN_STATUSES in DemandPageClient.tsx -- statuses that still need action in the
// demand backlog.
const DEMAND_OPEN_STATUSES = new Set(["SUBMITTED", "TRIAGED", "SCORED"]);

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [summary, demand] = await Promise.all([getPortfolioSummary(user), user ? listDemand(user) : Promise.resolve([])]);

  const ideationProjects = summary.projects.filter((p) => IDEATION_STAGES.includes(p.stage));
  const ideationReady = ideationProjects.filter((p) => p.ideationSubStage === "READY_FOR_EXECUTION").length;
  const ideationQuickWins = ideationProjects.filter((p) => p.roadmapStatus?.quickWin).length;

  const demandOpen = demand.filter((d) => DEMAND_OPEN_STATUSES.has(d.status)).length;
  const demandReadyToConvert = demand.filter((d) => d.status === "APPROVED").length;

  const atRisk = summary.projects
    .filter((p) => p.stage !== "CLOSED" && p.autoRag !== "GREEN")
    .sort((a) => (a.autoRag === "RED" ? -1 : 1));

  const budgetVariancePercent =
    summary.totalBudgetPlanned > 0
      ? Math.round(((summary.totalBudgetActual - summary.totalBudgetPlanned) / summary.totalBudgetPlanned) * 100)
      : 0;
  const healthNarrative = `${summary.activeCount} active project${summary.activeCount === 1 ? "" : "s"} — ${summary.byRag.GREEN ?? 0} on track, ${summary.byRag.YELLOW ?? 0} at risk, ${summary.byRag.RED ?? 0} off track. Portfolio spend is $${summary.totalBudgetActual.toLocaleString()} of $${summary.totalBudgetPlanned.toLocaleString()} planned (${budgetVariancePercent > 0 ? "+" : ""}${budgetVariancePercent}% variance).`;
  const insights = computeInsights(summary);

  return (
    <div>
      <Topbar
        title="Portfolio Dashboard"
        subtitle={`${summary.activeCount} active projects across the portfolio`}
        action={
          <ExportButtons
            endpoint="/api/reports/portfolio"
            filenamePrefix="portfolio-executive-summary"
            pdfLabel="1-Pager PDF"
            pptxLabel="1-Pager PPTX"
          />
        }
      />

      <div className="p-8 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 px-5 py-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Executive Summary</p>
          <p className="text-sm text-slate-700">{healthNarrative}</p>
        </div>

        <AiInsightsPanel insights={insights} />

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard label="Active Projects" value={summary.activeCount} />
          <KpiCard
            label="On Track (Green)"
            value={summary.byRag.GREEN ?? 0}
            tone="good"
          />
          <KpiCard
            label="At Risk (Yellow)"
            value={summary.byRag.YELLOW ?? 0}
            tone="warn"
          />
          <KpiCard
            label="Off Track (Red)"
            value={summary.byRag.RED ?? 0}
            tone="bad"
          />
          <KpiCard label="Avg % Complete" value={`${summary.avgPercentComplete}%`} />
          <KpiCard
            label="Overdue Tasks"
            value={summary.totalOverdueTasks}
            tone={summary.totalOverdueTasks > 0 ? "bad" : "good"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <KpiCard
            label="Planned Budget (active)"
            value={`$${summary.totalBudgetPlanned.toLocaleString()}`}
          />
          <KpiCard
            label="Actual Spend (active)"
            value={`$${summary.totalBudgetActual.toLocaleString()}`}
            tone={summary.totalBudgetActual > summary.totalBudgetPlanned ? "bad" : "good"}
          />
          <KpiCard
            label="Open High-Severity Risks"
            value={summary.totalOpenHighRisks}
            tone={summary.totalOpenHighRisks > 0 ? "warn" : "good"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card-lift bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 lg:col-span-1">
            <p className="text-sm font-semibold text-slate-900 mb-1">Portfolio Health</p>
            <RagPie byRag={summary.byRag} />
          </div>
          <div className="card-lift bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 lg:col-span-2">
            <p className="text-sm font-semibold text-slate-900 mb-1">Projects by Stage</p>
            <StageBar byStage={summary.byStage} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Link
            href="/ideation"
            className="card-lift bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 flex items-start gap-3 hover:border-accent-200 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center shrink-0">
              <Lightbulb size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">Ideation Pipeline</p>
                <ArrowRight size={14} className="text-slate-300" />
              </div>
              <p className="text-xs text-slate-500 mt-0.5 mb-3">Ideas moving through feasibility, architecture, and charter before execution</p>
              <div className="flex items-center gap-5">
                <div><p className="text-lg font-semibold text-slate-900">{ideationProjects.length}</p><p className="text-[11px] text-slate-400">in pipeline</p></div>
                <div><p className="text-lg font-semibold text-emerald-600">{ideationReady}</p><p className="text-[11px] text-slate-400">ready for execution</p></div>
                <div><p className="text-lg font-semibold text-slate-900">{ideationQuickWins}</p><p className="text-[11px] text-slate-400">roadmap quick wins</p></div>
              </div>
            </div>
          </Link>

          <Link
            href="/demand"
            className="card-lift bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 flex items-start gap-3 hover:border-accent-200 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center shrink-0">
              <Inbox size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">Demand Backlog</p>
                <ArrowRight size={14} className="text-slate-300" />
              </div>
              <p className="text-xs text-slate-500 mt-0.5 mb-3">Raw requests awaiting triage and scoring before they become an Idea</p>
              <div className="flex items-center gap-5">
                <div><p className="text-lg font-semibold text-slate-900">{demand.length}</p><p className="text-[11px] text-slate-400">total requests</p></div>
                <div><p className="text-lg font-semibold text-amber-600">{demandOpen}</p><p className="text-[11px] text-slate-400">open in backlog</p></div>
                <div><p className="text-lg font-semibold text-emerald-600">{demandReadyToConvert}</p><p className="text-[11px] text-slate-400">ready to convert</p></div>
              </div>
            </div>
          </Link>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RollupCard title="Budget by country" rows={groupBy(summary.projects, (p) => p.country ?? "Unassigned")} />
          <RollupCard title="Budget by program" rows={groupBy(summary.projects, (p) => p.program ?? "Unassigned")} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Needs Attention</p>
              <Link href="/projects" className="text-xs text-accent-600 hover:underline">
                View all projects
              </Link>
            </div>
            {atRisk.length === 0 ? (
              <p className="text-sm text-slate-400 p-4">
                Nothing flagged right now — every active project is green.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-2 font-medium">Project</th>
                    <th className="px-4 py-2 font-medium">Stage</th>
                    <th className="px-4 py-2 font-medium">Priority</th>
                    <th className="px-4 py-2 font-medium">Health</th>
                    <th className="px-4 py-2 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-accent-600">
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5"><StageBadge stage={p.stage} /></td>
                      <td className="px-4 py-2.5"><PriorityBadge priority={p.priority} /></td>
                      <td className="px-4 py-2.5"><RagBadge rag={p.autoRag} /></td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 max-w-xs truncate" title={p.autoRagReasons.join("; ")}>
                        {p.autoRagReasons[0]}
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            )}
          </div>

          <AiAskPanel />
        </div>
      </div>
    </div>
  );
}

function groupBy(
  projects: Awaited<ReturnType<typeof getPortfolioSummary>>["projects"],
  keyFn: (p: Awaited<ReturnType<typeof getPortfolioSummary>>["projects"][number]) => string
) {
  const map = new Map<string, { count: number; budgetPlanned: number; budgetActual: number }>();
  for (const p of projects) {
    const key = keyFn(p);
    const existing = map.get(key) ?? { count: 0, budgetPlanned: 0, budgetActual: 0 };
    existing.count += 1;
    existing.budgetPlanned += p.budgetPlanned ?? 0;
    existing.budgetActual += p.budgetActual ?? 0;
    map.set(key, existing);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.budgetPlanned - a.budgetPlanned);
}

function RollupCard({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; count: number; budgetPlanned: number; budgetActual: number }[];
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4">
      <p className="text-sm font-semibold text-slate-900 mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-slate-50 last:border-0">
                <td className="py-1.5 text-slate-700">{r.key}</td>
                <td className="py-1.5 text-slate-400 text-xs">{r.count} project{r.count === 1 ? "" : "s"}</td>
                <td className="py-1.5 text-right text-slate-600">${r.budgetActual.toLocaleString()} / ${r.budgetPlanned.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
