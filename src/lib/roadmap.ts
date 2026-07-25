import { eq, desc, inArray } from "drizzle-orm";
import { db } from "./db";
import { projects, roadmaps, roadmapItems, roadmapPhases } from "./db/schema";
import { listVisibleProjects } from "./tenancy";
import type { SessionUser } from "./auth";

// Ideas eligible for a roadmap run: at least Feasibility has been assessed (there's a score to
// reason about), and the idea hasn't already moved into Charter/Execution/Closing — past that
// point it's individually committed, not something still being sequenced against the rest of
// the portfolio. Scoped strictly to the caller's own organization (or null/internal), even for
// ADMIN, since each org's portfolio is prioritized on its own -- an ADMIN overseeing several
// client organizations isn't sequencing them against each other in one shared roadmap.
export async function getEligibleIdeasForRoadmap(user: SessionUser) {
  const visible = await listVisibleProjects(user);
  return visible.filter(
    (p) =>
      p.organizationId === user.organizationId &&
      p.feasibilityScore != null &&
      !["CHARTER", "EXECUTION", "CLOSING", "CLOSED"].includes(p.stage)
  );
}

export type RoadmapSummary = {
  id: string;
  createdAt: Date;
  createdBy: string | null;
  executiveSummary: string | null;
  itemCount: number;
};

// Most recent first -- a portfolio's prioritization history, not just its latest snapshot.
// Filtered in JS rather than via eq(organizationId, ...) so the internal (organizationId ==
// null) case works too -- Postgres's NULL semantics mean eq() against a literal null never
// matches NULL rows.
export async function listRoadmaps(user: SessionUser): Promise<RoadmapSummary[]> {
  const all = await db.select().from(roadmaps).orderBy(desc(roadmaps.createdAt));
  const filtered = all.filter((r) => r.organizationId === user.organizationId);

  if (!filtered.length) return [];
  const ids = filtered.map((r) => r.id);
  const items = await db.select({ roadmapId: roadmapItems.roadmapId }).from(roadmapItems).where(inArray(roadmapItems.roadmapId, ids));
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.roadmapId, (counts.get(it.roadmapId) ?? 0) + 1);

  return filtered.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
    executiveSummary: r.executiveSummary,
    itemCount: counts.get(r.id) ?? 0,
  }));
}

export type RoadmapDetail = {
  id: string;
  createdAt: Date;
  createdBy: string | null;
  executiveSummary: string | null;
  items: Array<{
    id: string;
    projectId: string;
    projectName: string;
    impact: string;
    effort: string;
    quickWin: boolean;
    rationale: string | null;
  }>;
  phases: Array<{ id: string; label: string; focus: string | null; actions: string | null }>;
};

// Returns null if the roadmap doesn't exist OR belongs to a different organization than the
// caller's -- same "not found" response either way so a client org can't probe for the
// existence of another org's roadmap by id.
export async function getRoadmapDetail(roadmapId: string, user: SessionUser): Promise<RoadmapDetail | null> {
  const [roadmap] = await db.select().from(roadmaps).where(eq(roadmaps.id, roadmapId));
  if (!roadmap) return null;
  if (roadmap.organizationId !== user.organizationId) return null;

  const [itemRows, phaseRows] = await Promise.all([
    db
      .select({
        id: roadmapItems.id,
        projectId: roadmapItems.projectId,
        projectName: projects.name,
        impact: roadmapItems.impact,
        effort: roadmapItems.effort,
        quickWin: roadmapItems.quickWin,
        rationale: roadmapItems.rationale,
        sortOrder: roadmapItems.sortOrder,
      })
      .from(roadmapItems)
      .innerJoin(projects, eq(roadmapItems.projectId, projects.id))
      .where(eq(roadmapItems.roadmapId, roadmapId)),
    db.select().from(roadmapPhases).where(eq(roadmapPhases.roadmapId, roadmapId)),
  ]);

  return {
    id: roadmap.id,
    createdAt: roadmap.createdAt,
    createdBy: roadmap.createdBy,
    executiveSummary: roadmap.executiveSummary,
    items: itemRows
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((it) => ({
        id: it.id,
        projectId: it.projectId,
        projectName: it.projectName,
        impact: it.impact,
        effort: it.effort,
        quickWin: it.quickWin,
        rationale: it.rationale,
      })),
    phases: phaseRows.sort((a, b) => a.sortOrder - b.sortOrder).map((p) => ({ id: p.id, label: p.label, focus: p.focus, actions: p.actions })),
  };
}
