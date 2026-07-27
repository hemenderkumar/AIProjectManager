import { eq, desc, inArray } from "drizzle-orm";
import { db } from "./db";
import { projects, organizations, roadmaps, roadmapItems, roadmapPhases } from "./db/schema";
import { listVisibleProjects } from "./tenancy";
import { logAudit } from "./audit";
import type { SessionUser } from "./auth";

// Ideas eligible for a roadmap run: at least Feasibility has been assessed (there's a score to
// reason about), and the idea hasn't actually started execution or been closed out yet.
//
// Previously this also excluded stage === "CHARTER", meant to reflect "already committed,
// not still being sequenced." That excluded far more than intended: CHARTER is the stage for
// BOTH the "Scope & Charter" and "Resourcing Decision" sub-stages (see STAGE_FOR_SUB_STAGE in
// ideationGates.ts) -- i.e. most of the post-feasibility gate sequence. An idea sits in stage
// CHARTER for the entire time between passing Architecture review and actually starting
// execution, which is exactly the window a roadmap is most useful for. Only EXECUTION (work
// has actually started) and CLOSING/CLOSED should take an idea out of contention.
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
    (p) => p.feasibilityScore != null && !["EXECUTION", "CLOSING", "CLOSED"].includes(p.stage)
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
  quickWinCount: number;
  // The exact set of project ids this roadmap covers -- lets the client detect "you've already
  // generated a roadmap for this exact selection" before calling Generate, so it can offer New
  // vs Revise instead of silently piling up duplicates.
  projectIds: string[];
  // Idea names in the same order as projectIds -- lets the sidebar list identify a roadmap by
  // what it's actually FOR ("CRM Migration, Vendor Portal"), not just when it was generated.
  projectNames: string[];
  // Set when this roadmap was produced by "Revise with AI" on an earlier one. Together with
  // revisionInstruction, lets the sidebar list show a roadmap's revision lineage.
  revisedFromRoadmapId: string | null;
  revisionInstruction: string | null;
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
  const items = await db
    .select({
      roadmapId: roadmapItems.roadmapId,
      projectId: roadmapItems.projectId,
      projectName: projects.name,
      quickWin: roadmapItems.quickWin,
      sortOrder: roadmapItems.sortOrder,
    })
    .from(roadmapItems)
    .innerJoin(projects, eq(roadmapItems.projectId, projects.id))
    .where(inArray(roadmapItems.roadmapId, ids))
    .orderBy(roadmapItems.sortOrder);
  const byRoadmap = new Map<string, { projectIds: string[]; projectNames: string[]; quickWinCount: number }>();
  for (const it of items) {
    const entry = byRoadmap.get(it.roadmapId) ?? { projectIds: [], projectNames: [], quickWinCount: 0 };
    entry.projectIds.push(it.projectId);
    entry.projectNames.push(it.projectName);
    if (it.quickWin) entry.quickWinCount += 1;
    byRoadmap.set(it.roadmapId, entry);
  }

  return filtered.map((r) => {
    const entry = byRoadmap.get(r.id);
    return {
      id: r.id,
      createdAt: r.createdAt,
      createdBy: r.createdBy,
      executiveSummary: r.executiveSummary,
      itemCount: entry?.projectIds.length ?? 0,
      quickWinCount: entry?.quickWinCount ?? 0,
      projectIds: entry?.projectIds ?? [],
      projectNames: entry?.projectNames ?? [],
      revisedFromRoadmapId: r.revisedFromRoadmapId,
      revisionInstruction: r.revisionInstruction,
    };
  });
}

export type RoadmapDetail = {
  id: string;
  organizationId: string | null;
  createdAt: Date;
  createdBy: string | null;
  executiveSummary: string | null;
  revisedFromRoadmapId: string | null;
  revisionInstruction: string | null;
  items: Array<{
    id: string;
    projectId: string;
    projectName: string;
    organizationId: string | null;
    impact: string;
    effort: string;
    quickWin: boolean;
    rationale: string | null;
    // The project's CURRENT priority (live, from projects.priority) -- not recomputed from
    // impact/quickWin -- so this reflects what actually landed after the write-back in
    // POST /api/ai/roadmap (which skips projects already at CRITICAL), and stays accurate even
    // if a person has since changed it by hand.
    currentPriority: string;
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
        organizationId: projects.organizationId,
        impact: roadmapItems.impact,
        effort: roadmapItems.effort,
        quickWin: roadmapItems.quickWin,
        rationale: roadmapItems.rationale,
        sortOrder: roadmapItems.sortOrder,
        currentPriority: projects.priority,
      })
      .from(roadmapItems)
      .innerJoin(projects, eq(roadmapItems.projectId, projects.id))
      .where(eq(roadmapItems.roadmapId, roadmapId)),
    db.select().from(roadmapPhases).where(eq(roadmapPhases.roadmapId, roadmapId)),
  ]);

  return {
    id: roadmap.id,
    organizationId: roadmap.organizationId,
    createdAt: roadmap.createdAt,
    createdBy: roadmap.createdBy,
    executiveSummary: roadmap.executiveSummary,
    revisedFromRoadmapId: roadmap.revisedFromRoadmapId,
    revisionInstruction: roadmap.revisionInstruction,
    items: itemRows
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((it) => ({
        id: it.id,
        projectId: it.projectId,
        projectName: it.projectName,
        organizationId: it.organizationId,
        impact: it.impact,
        effort: it.effort,
        quickWin: it.quickWin,
        rationale: it.rationale,
        currentPriority: it.currentPriority,
      })),
    phases: phaseRows.sort((a, b) => a.sortOrder - b.sortOrder).map((p) => ({ id: p.id, label: p.label, focus: p.focus, actions: p.actions })),
  };
}

// Priority the roadmap's own classification implies for a project -- used so generating a
// roadmap doesn't just sit as a read-only report: it actually nudges the project's Priority
// field, the one signal already surfaced everywhere else in the app (Ideation list, dashboard,
// AI portfolio summaries). Quick wins always land at HIGH regardless of impact, since "high
// value, low effort" is exactly what should jump the queue; otherwise priority tracks impact.
// Never proposes CRITICAL -- that stays a manual escalation only a person makes.
export function derivePriorityFromRoadmap(impact: string, quickWin: boolean): "LOW" | "MEDIUM" | "HIGH" {
  if (quickWin || impact === "HIGH") return "HIGH";
  if (impact === "MEDIUM") return "MEDIUM";
  return "LOW";
}

// Shared by both POST /api/ai/roadmap (fresh generate) and POST /api/ai/roadmap-revise (AI
// revision) -- a roadmap run, first-time or revised, should always try to nudge each covered
// project's Priority field the same way. Never downgrades a project someone has manually
// escalated to CRITICAL, and skips the write (and the audit entry) entirely when the proposed
// value matches what's already there, so revising a roadmap without changing an item's
// classification doesn't spam the audit log with no-op "changes."
export async function applyRoadmapPriorityWriteBack(
  user: SessionUser,
  roadmapId: string,
  items: Array<{ project_id: string; impact: string; quick_win: boolean }>
): Promise<void> {
  for (const it of items) {
    const proposed = derivePriorityFromRoadmap(it.impact, !!it.quick_win);
    const [project] = await db.select({ id: projects.id, priority: projects.priority }).from(projects).where(eq(projects.id, it.project_id));
    if (!project || project.priority === "CRITICAL" || project.priority === proposed) continue;

    await db.update(projects).set({ priority: proposed }).where(eq(projects.id, it.project_id));
    await logAudit({
      actor: user,
      action: "roadmap.priority_set",
      entityType: "project",
      entityId: it.project_id,
      organizationId: user.organizationId,
      beforeValue: project.priority,
      afterValue: proposed,
      detail: `Priority updated to ${proposed} by roadmap ${roadmapId} (impact: ${it.impact}, quick win: ${!!it.quick_win}).`,
    });
  }
}

export type ProjectRoadmapStatus = {
  roadmapId: string;
  generatedAt: Date;
  impact: string;
  effort: string;
  quickWin: boolean;
  rationale: string | null;
};

// The most recent roadmap call for each of the given projects, if any -- lets a project's
// other views (Ideation list, Overview tab) show "last roadmap call: MEDIUM impact / quick win"
// without anyone having to visit the Roadmap page itself. A project can appear in more than one
// roadmap over time (see the picklist letting someone rebuild a roadmap for a new combination),
// so this always resolves to whichever roadmap ran most recently, not just the first one found.
export async function getLatestRoadmapStatusForProjects(projectIds: string[]): Promise<Map<string, ProjectRoadmapStatus>> {
  const map = new Map<string, ProjectRoadmapStatus>();
  if (!projectIds.length) return map;

  const rows = await db
    .select({
      projectId: roadmapItems.projectId,
      impact: roadmapItems.impact,
      effort: roadmapItems.effort,
      quickWin: roadmapItems.quickWin,
      rationale: roadmapItems.rationale,
      roadmapId: roadmapItems.roadmapId,
      generatedAt: roadmaps.createdAt,
    })
    .from(roadmapItems)
    .innerJoin(roadmaps, eq(roadmapItems.roadmapId, roadmaps.id))
    .where(inArray(roadmapItems.projectId, projectIds));

  for (const r of rows) {
    const existing = map.get(r.projectId);
    if (!existing || r.generatedAt > existing.generatedAt) {
      map.set(r.projectId, {
        roadmapId: r.roadmapId,
        generatedAt: r.generatedAt,
        impact: r.impact,
        effort: r.effort,
        quickWin: r.quickWin,
        rationale: r.rationale,
      });
    }
  }
  return map;
}
