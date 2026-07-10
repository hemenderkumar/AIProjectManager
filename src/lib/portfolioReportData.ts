import type { getPortfolioSummary } from "./portfolio";

export type PortfolioOnePager = {
  activeCount: number;
  byRag: { GREEN: number; YELLOW: number; RED: number };
  avgPercentComplete: number;
  totalBudgetPlanned: number;
  totalBudgetActual: number;
  totalOverdueTasks: number;
  totalOpenHighRisks: number;
  topAtRisk: { name: string; stage: string; rag: string; reason: string }[];
};

// Builds the dataset behind the executive one-pager (online banner + PDF/PPTX export) —
// deliberately just a reshape of numbers already computed by getPortfolioSummary, so
// nothing here is AI-generated or can drift from the live KPI engine.
export function buildPortfolioOnePager(
  summary: Awaited<ReturnType<typeof getPortfolioSummary>>
): PortfolioOnePager {
  const topAtRisk = summary.projects
    .filter((p) => p.stage !== "CLOSED" && p.autoRag !== "GREEN")
    .sort((a, b) => {
      const rank = (r: string) => (r === "RED" ? 0 : r === "YELLOW" ? 1 : 2);
      return rank(a.autoRag) - rank(b.autoRag);
    })
    .slice(0, 6)
    .map((p) => ({ name: p.name, stage: p.stage, rag: p.autoRag, reason: p.autoRagReasons[0] ?? "" }));

  return {
    activeCount: summary.activeCount,
    byRag: {
      GREEN: summary.byRag.GREEN ?? 0,
      YELLOW: summary.byRag.YELLOW ?? 0,
      RED: summary.byRag.RED ?? 0,
    },
    avgPercentComplete: summary.avgPercentComplete,
    totalBudgetPlanned: summary.totalBudgetPlanned,
    totalBudgetActual: summary.totalBudgetActual,
    totalOverdueTasks: summary.totalOverdueTasks,
    totalOpenHighRisks: summary.totalOpenHighRisks,
    topAtRisk,
  };
}
