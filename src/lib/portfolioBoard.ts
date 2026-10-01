import { db } from "./db";
import { portfolioDecisions, projects } from "./db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { getPortfolioSummary } from "./portfolio";
import { getLatestRoadmapStatusForProjects } from "./roadmap";
import type { SessionUser } from "./auth";

// A decision log for the Portfolio Board level -- which initiatives actually got funded,
// deferred, held, or killed, by whom, and why. Reuses getPortfolioSummary() (RAG/budget/risk
// rollup) and getLatestRoadmapStatusForProjects() (quick-win/impact bucketing) rather than
// re-querying that data, so the Portfolio Board view is always consistent with what the rest
// of the app already shows for a project -- this is a decision layer on top of existing
// portfolio data, not a second source of truth for it.
export async function getPortfolioBoardView(user?: SessionUser | null) {
  const summary = await getPortfolioSummary(user);
  const projectIds = summary.projects.map((p) => p.id);
  const roadmapStatus = await getLatestRoadmapStatusForProjects(projectIds);

  const decisionRows = projectIds.length
    ? await db
        .select()
        .from(portfolioDecisions)
        .where(inArray(portfolioDecisions.projectId, projectIds))
        .orderBy(desc(portfolioDecisions.decidedAt))
    : [];

  // Most recent decision wins per project -- decisionRows is already ordered desc, so the
  // first one seen per projectId is the latest.
  const latestByProject = new Map<string, (typeof decisionRows)[number]>();
  for (const d of decisionRows) {
    if (!latestByProject.has(d.projectId)) latestByProject.set(d.projectId, d);
  }

  const items = summary.projects.map((p) => ({
    id: p.id,
    name: p.name,
    stage: p.stage,
    priority: p.priority,
    autoRag: p.autoRag,
    budgetPlanned: p.budgetPlanned,
    budgetActual: p.budgetActual,
    percentComplete: p.percentComplete,
    roadmap: roadmapStatus.get(p.id) ?? null,
    latestDecision: latestByProject.get(p.id) ?? null,
  }));

  // Portfolio mix -- a rough run-vs-grow split using stage as the signal (ONGOING_SUPPORT-
  // style/closed-out maintenance work isn't modeled as its own stage today, so this uses
  // priority/stage as the closest available proxy rather than inventing a new taxonomy).
  const byDecisionType: Record<string, number> = { FUND: 0, DEFER: 0, HOLD: 0, KILL: 0, UNDECIDED: 0 };
  for (const item of items) {
    byDecisionType[item.latestDecision?.decisionType ?? "UNDECIDED"]++;
  }

  return {
    items,
    totalBudgetPlanned: summary.totalBudgetPlanned,
    totalBudgetActual: summary.totalBudgetActual,
    byRag: summary.byRag,
    byDecisionType,
  };
}

export async function recordPortfolioDecision(
  user: SessionUser,
  input: { projectId: string; decisionType: "FUND" | "DEFER" | "HOLD" | "KILL"; budgetRequested?: number | null; budgetApproved?: number | null; rationale?: string | null }
) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId));
  if (!project) return null;

  const [created] = await db
    .insert(portfolioDecisions)
    .values({
      projectId: input.projectId,
      decisionType: input.decisionType,
      budgetRequested: input.budgetRequested ?? null,
      budgetApproved: input.budgetApproved ?? null,
      rationale: input.rationale ?? null,
      decidedBy: user.name,
    })
    .returning();
  return created;
}
