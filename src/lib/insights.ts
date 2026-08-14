// Deterministic, rule-based portfolio insight generation -- the "proactive AI PM" surface on
// the Dashboard. Deliberately NOT an AI/LLM call: the existing AI PM (AvatarAssistant, /api/ai/ask)
// is already reactive (you ask, it answers) and works well for open-ended questions, but nothing
// today surfaces a problem unprompted. Computing insights as fast, synchronous rules over data
// the dashboard already fetched (see getPortfolioSummary) means they render with zero added
// latency and zero added AI cost on every single dashboard load -- the "intelligence" here is in
// picking the right thresholds and language, not in calling a model. Threshold values are meant
// to be conservative enough that a healthy portfolio shows nothing but the "all clear" insight.
import type { getPortfolioSummary } from "./portfolio";

export type InsightSeverity = "critical" | "warning" | "info";

export type Insight = {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  href?: string;
  hrefLabel?: string;
};

type Summary = Awaited<ReturnType<typeof getPortfolioSummary>>;

export function computeInsights(summary: Summary): Insight[] {
  const insights: Insight[] = [];

  const redProjects = summary.projects.filter((p) => p.stage !== "CLOSED" && p.autoRag === "RED");
  if (redProjects.length > 0) {
    const names = redProjects.slice(0, 3).map((p) => p.name).join(", ");
    const overflow = redProjects.length > 3 ? ` and ${redProjects.length - 3} more` : "";
    insights.push({
      id: "off-track",
      severity: "critical",
      title: `${redProjects.length} project${redProjects.length === 1 ? "" : "s"} off track`,
      detail: `${names}${overflow} — flagged red by the health engine. Most common reason: ${redProjects[0]?.autoRagReasons?.[0] ?? "schedule or budget variance"}.`,
      href: "/projects",
      hrefLabel: "Review off-track projects",
    });
  }

  const yellowProjects = summary.projects.filter((p) => p.stage !== "CLOSED" && p.autoRag === "YELLOW");
  if (yellowProjects.length > 0) {
    insights.push({
      id: "at-risk",
      severity: "warning",
      title: `${yellowProjects.length} project${yellowProjects.length === 1 ? "" : "s"} trending at risk`,
      detail: `Currently yellow, not yet red — worth a look before they slip further: ${yellowProjects.slice(0, 3).map((p) => p.name).join(", ")}.`,
      href: "/projects",
      hrefLabel: "Review at-risk projects",
    });
  }

  if (summary.totalOverdueTasks > 0) {
    insights.push({
      id: "overdue-tasks",
      severity: summary.totalOverdueTasks >= 10 ? "critical" : "warning",
      title: `${summary.totalOverdueTasks} overdue task${summary.totalOverdueTasks === 1 ? "" : "s"} across the portfolio`,
      detail:
        summary.totalOverdueTasks >= 10
          ? "That's enough volume to be dragging down multiple projects at once — worth a portfolio-wide push, not just one team's problem."
          : "Small enough to clear quickly, but worth flagging before it compounds.",
      href: "/projects",
      hrefLabel: "View projects",
    });
  }

  if (summary.totalOpenHighRisks > 0) {
    insights.push({
      id: "open-risks",
      severity: summary.totalOpenHighRisks >= 3 ? "critical" : "warning",
      title: `${summary.totalOpenHighRisks} open high-severity risk${summary.totalOpenHighRisks === 1 ? "" : "s"}`,
      detail: "Impact × likelihood scored high and still unresolved — these are the risks most likely to actually land if left unattended.",
      href: "/projects",
      hrefLabel: "View at-risk projects",
    });
  }

  if (summary.totalBudgetPlanned > 0) {
    const variance = Math.round(((summary.totalBudgetActual - summary.totalBudgetPlanned) / summary.totalBudgetPlanned) * 100);
    if (variance >= 10) {
      insights.push({
        id: "budget-variance",
        severity: variance >= 20 ? "critical" : "warning",
        title: `Portfolio spend is ${variance}% over plan`,
        detail: `$${summary.totalBudgetActual.toLocaleString()} spent against $${summary.totalBudgetPlanned.toLocaleString()} planned across active projects.`,
        href: "/dashboard",
        hrefLabel: "See budget breakdown",
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      id: "all-clear",
      severity: "info",
      title: "Portfolio is healthy",
      detail: `${summary.activeCount} active project${summary.activeCount === 1 ? "" : "s"}, no off-track projects, no overdue tasks, and no unresolved high-severity risks right now.`,
    });
  }

  // Most severe first: critical, then warning, then info -- so the thing that most needs
  // attention is always what's read first, regardless of which rule happened to fire.
  const rank: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return insights.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
