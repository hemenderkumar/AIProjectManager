import Link from "next/link";
import Topbar from "@/components/Topbar";
import KpiCard from "@/components/KpiCard";
import RagPie from "@/components/RagPie";
import StageBar from "@/components/StageBar";
import AiAskPanel from "@/components/AiAskPanel";
import ExportButtons from "@/components/ExportButtons";
import { RagBadge, StageBadge, PriorityBadge } from "@/components/badges";
import { getPortfolioSummary } from "@/lib/portfolio";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const summary = await getPortfolioSummary(user);

  const atRisk = summary.projects
    .filter((p) => p.stage !== "CLOSED" && p.autoRag !== "GREEN")
    .sort((a) => (a.autoRag === "RED" ? -1 : 1));

  const budgetVariancePercent =
    summary.totalBudgetPlanned > 0
      ? Math.round(((summary.totalBudgetActual - summary.totalBudgetPlanned) / summary.totalBudgetPlanned) * 100)
      : 0;
  const healthNarrative = `${summary.activeCount} active project${summary.activeCount === 1 ? "" : "s"} — ${summary.byRag.GREEN ?? 0} on track, ${summary.byRag.YELLOW ?? 0} at risk, ${summary.byRag.RED ?? 0} off track. Portfolio spend is $${summary.totalBudgetActual.toLocaleString()} of $${summary.totalBudgetPlanned.toLocaleString()} planned (${budgetVariancePercent > 0 ? "+" : ""}${budgetVariancePercent}% variance).`;

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
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-5 py-4">
          <p className="text-xs font-semibold text-indigo-900 uppercase tracking-wide mb-1">Executive Summary</p>
          <p className="text-sm text-indigo-900">{healthNarrative}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
          <div className="bg-white rounded-xl border border-slate-200 p-4 lg:col-span-1">
            <p className="text-sm font-semibold text-slate-900 mb-1">Portfolio Health</p>
            <RagPie byRag={summary.byRag} />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 lg:col-span-2">
            <p className="text-sm font-semibold text-slate-900 mb-1">Projects by Stage</p>
            <StageBar byStage={summary.byStage} />
          </div>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RollupCard title="Budget by country" rows={groupBy(summary.projects, (p) => p.country ?? "Unassigned")} />
          <RollupCard title="Budget by program" rows={groupBy(summary.projects, (p) => p.program ?? "Unassigned")} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Needs Attention</p>
              <Link href="/projects" className="text-xs text-indigo-600 hover:underline">
                View all projects
              </Link>
            </div>
            {atRisk.length === 0 ? (
              <p className="text-sm text-slate-400 p-4">
                Nothing flagged right now — every active project is green.
              </p>
            ) : (
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
                        <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
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
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-900 mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No data yet.</p>
      ) : (
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
      )}
    </div>
  );
}
