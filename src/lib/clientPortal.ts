import { db } from "./db";
import { deliverables, invoices, milestones, satisfactionSurveys } from "./db/schema";
import { inArray } from "drizzle-orm";
import { getAllProjectsWithMetrics } from "./portfolio";
import type { SessionUser } from "./auth";

// Aggregates a client-friendly rollup across every project `user` can see (the same
// visibility rule as the internal dashboard -- see listVisibleProjects in tenancy.ts -- so a
// SUPER_USER gets their whole organization's projects, and a PM/CONTRIBUTOR/VIEWER gets just
// the projects they're a member of). Unlike getProjectDetail() this is deliberately a *subset*
// of what the internal tabs show: health, upcoming milestones, deliverables awaiting/past
// review, open invoices, and satisfaction survey results -- the things a client sponsor
// actually wants a one-glance answer to, not the full PM toolset (tasks, risks, sprints,
// comms logs, etc. stay internal-only surfaces reached via the regular project tabs).
export async function getClientPortalData(user?: SessionUser | null) {
  const projects = await getAllProjectsWithMetrics(user);
  const activeProjects = projects.filter((p) => p.stage !== "CLOSED");

  if (!projects.length) {
    return {
      projects,
      activeCount: 0,
      byRag: { GREEN: 0, YELLOW: 0, RED: 0 } as Record<string, number>,
      totalBudgetPlanned: 0,
      totalBudgetActual: 0,
      upcomingMilestones: [],
      recentDeliverables: [],
      openInvoices: [],
      satisfaction: { avgNps: null as number | null, avgCsat: null as number | null, responseCount: 0 },
    };
  }

  const projectIds = projects.map((p) => p.id);
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  const [allMilestones, allDeliverables, allInvoices, allSurveys] = await Promise.all([
    db.select().from(milestones).where(inArray(milestones.projectId, projectIds)),
    db.select().from(deliverables).where(inArray(deliverables.projectId, projectIds)),
    db.select().from(invoices).where(inArray(invoices.projectId, projectIds)),
    db.select().from(satisfactionSurveys).where(inArray(satisfactionSurveys.projectId, projectIds)),
  ]);

  const upcomingMilestones = allMilestones
    .filter((m) => m.status !== "DONE")
    .map((m) => ({ ...m, projectName: projectNameById.get(m.projectId) ?? "" }))
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.getTime() - b.dueDate.getTime();
    })
    .slice(0, 8);

  // Only surface deliverables a client would actually want to see: under review (something
  // may need their sign-off) or already approved/final (something they can reference) --
  // internal DRAFT working copies stay off the portal until a PM moves them forward.
  const recentDeliverables = allDeliverables
    .filter((d) => d.status === "IN_REVIEW" || d.status === "APPROVED" || d.status === "FINAL")
    .map((d) => ({ ...d, projectName: projectNameById.get(d.projectId) ?? "" }))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 8);

  const openInvoices = allInvoices
    .filter((i) => i.status === "PENDING" || i.status === "OVERDUE" || i.status === "DISPUTED")
    .map((i) => ({ ...i, projectName: projectNameById.get(i.projectId) ?? "" }))
    .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));

  const completedSurveys = allSurveys.filter((s) => s.status === "COMPLETED");
  const npsScores = completedSurveys.map((s) => s.npsScore).filter((n): n is number => n != null);
  const csatScores = completedSurveys.map((s) => s.csatScore).filter((n): n is number => n != null);

  const byRag = { GREEN: 0, YELLOW: 0, RED: 0 } as Record<string, number>;
  activeProjects.forEach((p) => (byRag[p.autoRag] = (byRag[p.autoRag] ?? 0) + 1));

  return {
    projects,
    activeCount: activeProjects.length,
    byRag,
    totalBudgetPlanned: activeProjects.reduce((s, p) => s + (p.budgetPlanned ?? 0), 0),
    totalBudgetActual: activeProjects.reduce((s, p) => s + (p.budgetActual ?? 0), 0),
    upcomingMilestones,
    recentDeliverables,
    openInvoices,
    satisfaction: {
      avgNps: npsScores.length ? npsScores.reduce((a, b) => a + b, 0) / npsScores.length : null,
      avgCsat: csatScores.length ? csatScores.reduce((a, b) => a + b, 0) / csatScores.length : null,
      responseCount: completedSurveys.length,
    },
  };
}
