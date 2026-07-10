import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/lib/ai";
import { getPortfolioSummary, formatPortfolioForAI, getProjectDetail } from "@/lib/portfolio";
import { buildPlannedVsActual } from "@/lib/reportData";
import { requireRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await req.json().catch(() => ({ projectId: undefined }));

  const system = `You are a PMO director preparing a status report for C-level executives.
Write in a crisp, executive tone: short paragraphs, no fluff, lead with the bottom line.
Structure the report with Markdown headings: Executive Summary, Portfolio Health, Key Risks &
Blockers, Budget Snapshot, Recommended Actions. Call out RED/YELLOW projects explicitly and
say what decision or support is needed from leadership.`;

  let user: string;
  let chartData = null;
  if (projectId) {
    const detail = await getProjectDetail(projectId);
    if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
    const p = detail.project;
    chartData = buildPlannedVsActual(detail);
    user = `Prepare a single-project executive status report for:
Project: ${p.name} (stage: ${p.stage}, priority: ${p.priority})
Auto health: ${detail.autoRag} — reasons: ${detail.autoRagReasons.join("; ")}
% complete: ${p.percentComplete}% (expected by now based on timeline: ${chartData.schedule.plannedPercent}%)
Budget planned/actual: $${p.budgetPlanned}/$${p.budgetActual} (variance ${detail.budgetVariancePercent}%)
Schedule variance (days): ${detail.scheduleVarianceDays}
Effort planned/actual (hours): ${chartData.effort.plannedHours}/${chartData.effort.actualHours}
Open risks: ${detail.risks.filter(r => r.status !== "CLOSED").map(r => `${r.description} (impact ${r.impact}, likelihood ${r.likelihood})`).join("; ") || "none"}
Overdue tasks: ${detail.tasks.filter(t => t.dueDate && t.dueDate < new Date() && t.status !== "DONE").map(t => t.title).join("; ") || "none"}
Latest status update: ${detail.statusUpdates[0]?.summary ?? "none logged"}`;
  } else {
    const summary = await getPortfolioSummary();
    user = `Prepare a portfolio-wide executive status report using this data:\n\n${formatPortfolioForAI(summary)}`;
  }

  const report = await askClaude(system, user);
  return NextResponse.json({ report, chartData });
}
