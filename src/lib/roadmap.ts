import { eq, desc, inArray } from "drizzle-orm";
import { db } from "./db";
import { projects, organizations, roadmaps, roadmapItems, roadmapPhases } from "./db/schema";
import { listVisibleProjects } from "./tenancy";
import type { SessionUser } from "./auth";

// Ideas eligible for a roadmap run: at least Feasibility has been assessed (there's a score to
// reason about), and the idea hasn't already moved into Charter/Execution/Closing — past that
// point it's individually committed, not something still being sequenced against the rest of
// the portfolio.
//
// Previously this also required p.organizationId === user.organizationId, meant to keep an
// ADMIN from combining several client orgs' ideas into one shared roadmap. In practice that
// broke detection for exactly the users who need this most: an ADMIN or internal PM's own
// organizationId is null, so the check silently excluded every idea that belonged to an actual
// client org (i.e. nearly everything) even though listVisibleProjects() -- which already
// applies the correct per-role visibility (ADMIN: everything, SUPER_USER: own org,
// PM/CONTRIBUTOR/VIEWER: project membership) -- had already deemed it visible. Removed: caller
// now explicitly picks which eligible ideas to combine (see api/ai/roadmap's projectIds), so
// the old blanket restriction is both redundant and no longer the right way to prevent an
// unintended cross-org mashup.
export async function getEligibleIdeasForRoadmap(user: SessionUser) {
  const visible = await listVisibleProjects(user);
  return visible.filter(
    (p) => p.feasibilityScore != null && !["CHARTER", "EXECUTION", "CLOSING", "CLOSED"].includes(p.stage)
  );
}

export type EligibleIdeaSummary = {
  id: string;
  name: string;
  feasibilityScore: number;
  organizationId: string | null;
  organizationName: string | null;
};

// Lightweight shape for the picklist UI -- just enough to label a checkbox (name, score, which
// org it belongs to when the caller can see more than one). Kept separate from the full project
// rows getEligibleIdeasForRoadmap returns, since the AI generation route needs much more
// (problem statement, architecture notes, cost) that this list has no reason to ship to the client.
export async function summarizeEligibleIdeas(ideas: Awaited<ReturnType<typeof getEligibleIdeasForRoadmap>>): Promise<EligibleIdeaSummary[]> {
  if (!ideas.length) return [];
  const orgIds = Array.from(new Set(ideas.map((p) => p.organizationId).filter((id): id is string => id != null)));
  const orgRows = orgIds.length ? await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, orgIds)) : [];
  const orgNameById = new Map(orgRows.map((o) => [o.id, o.name]));
  return ideas.map((p) => ({
    id: p.id,
    name: p.name,
    feasibilityScore: p.feasibilityScore as number,
    organizationId: p.organizationId,
    organizationName: p.organizationId ? orgNameById.get(p.organizationId) ?? null : null,
  }));
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
