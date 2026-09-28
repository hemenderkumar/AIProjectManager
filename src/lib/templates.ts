import { db } from "./db";
import { projectTemplates, projects, tasks, projectMembers, sprints } from "./db/schema";
import { eq, or, isNull, and } from "drizzle-orm";
import { canAccessProject } from "./tenancy";
import type { SessionUser } from "./auth";

// A template snapshot is a point-in-time copy: charter-relevant fields plus a task/phase
// skeleton. Kept as one jsonb blob rather than child tables — see the column comment on
// projectTemplates.snapshot in schema.ts.
//
// executionMethodology/sprints/storyPoints are optional so older snapshots (created before
// this addition) still validate and instantiate exactly as before -- a template with no
// sprints and no methodology just leaves the created project on its default (WATERFALL).
// sprintIndex on a taskSkeleton entry is an index into the snapshot's own `sprints` array
// (not a real sprint id, since the sprint doesn't exist until instantiation creates it).
export type TemplateSnapshot = {
  charter: {
    description: string | null;
    problemStatement: string | null;
    proposedSolution: string | null;
    expectedBenefits: string | null;
    program: string | null;
  };
  executionMethodology?: "WATERFALL" | "SCRUM" | "HYBRID";
  sprints?: Array<{ name: string; goal?: string | null }>;
  taskSkeleton: Array<{
    title: string;
    phase: string | null;
    priority: string;
    estimateHours: number | null;
    storyPoints?: number | null;
    sprintIndex?: number | null;
  }>;
};

export async function listTemplates(user: SessionUser) {
  // Org-wide templates (organizationId matches this user's org) plus shared/starter
  // templates (organizationId null) — same null-means-shared convention as roadmaps.
  return db
    .select()
    .from(projectTemplates)
    .where(user.organizationId ? or(eq(projectTemplates.organizationId, user.organizationId), isNull(projectTemplates.organizationId)) : isNull(projectTemplates.organizationId));
}

export async function createTemplateFromProject(user: SessionUser, projectId: string, name: string, description?: string) {
  const ok = await canAccessProject(user, projectId);
  if (!ok) return null;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;
  const projectTasks = await db.select().from(tasks).where(eq(tasks.projectId, projectId));

  const snapshot: TemplateSnapshot = {
    charter: {
      description: project.description,
      problemStatement: project.problemStatement,
      proposedSolution: project.proposedSolution,
      expectedBenefits: project.expectedBenefits,
      program: project.program,
    },
    executionMethodology: project.executionMethodology,
    taskSkeleton: projectTasks.map((t) => ({
      title: t.title,
      phase: t.phase,
      priority: t.priority,
      estimateHours: t.estimateHours,
      storyPoints: t.storyPoints,
    })),
  };

  const [created] = await db
    .insert(projectTemplates)
    .values({
      organizationId: user.organizationId ?? null,
      name,
      description: description ?? null,
      snapshot,
      createdBy: user.name,
    })
    .returning();
  return created;
}

// Shared by both the direct "use this template as-is" path and the AI-tweaked path
// (POST /api/ai/template-tweak proposes an adjusted snapshot, which the client then submits
// back here unchanged) -- one place turns a snapshot into a real project either way, so the
// two flows can't drift.
export async function createProjectFromSnapshot(user: SessionUser, snapshot: TemplateSnapshot, newProjectName: string) {
  const [created] = await db
    .insert(projects)
    .values({
      name: newProjectName,
      organizationId: user.organizationId ?? null,
      description: snapshot.charter?.description ?? null,
      problemStatement: snapshot.charter?.problemStatement ?? null,
      proposedSolution: snapshot.charter?.proposedSolution ?? null,
      expectedBenefits: snapshot.charter?.expectedBenefits ?? null,
      program: snapshot.charter?.program ?? null,
      stage: "INCEPTION",
      priority: "MEDIUM",
      ideaType: "OPPORTUNITY",
      ...(snapshot.executionMethodology ? { executionMethodology: snapshot.executionMethodology } : {}),
    })
    .returning();

  await db.insert(projectMembers).values({ projectId: created.id, userId: user.id });

  // Create the template's sprints first (if any) so taskSkeleton entries can reference them
  // by array index -- sprintIndex is an index into snapshot.sprints, not a real sprint id,
  // since the sprint doesn't exist until this point.
  let createdSprintIds: string[] = [];
  if (snapshot.sprints?.length) {
    const insertedSprints = await db
      .insert(sprints)
      .values(
        snapshot.sprints.map((s) => ({
          projectId: created.id,
          name: s.name,
          goal: s.goal ?? null,
          status: "PLANNED" as const,
        }))
      )
      .returning({ id: sprints.id });
    createdSprintIds = insertedSprints.map((s) => s.id);
  }

  if (snapshot.taskSkeleton?.length) {
    await db.insert(tasks).values(
      snapshot.taskSkeleton.map((t) => ({
        projectId: created.id,
        title: t.title,
        phase: t.phase,
        priority: (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(t.priority) ? t.priority : "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
        estimateHours: t.estimateHours ?? 0,
        storyPoints: t.storyPoints ?? null,
        sprintId: t.sprintIndex != null ? createdSprintIds[t.sprintIndex] ?? null : null,
      }))
    );
  }

  return created;
}

export async function createProjectFromTemplate(user: SessionUser, templateId: string, newProjectName: string) {
  const [template] = await db.select().from(projectTemplates).where(eq(projectTemplates.id, templateId));
  if (!template) return null;
  return createProjectFromSnapshot(user, template.snapshot as TemplateSnapshot, newProjectName);
}

// Same org-wide-or-shared visibility rule as listTemplates, scoped down to one template --
// used by the AI tweak endpoint so it can't be pointed at another organization's private
// template by id.
export async function getTemplate(user: SessionUser, templateId: string) {
  const visibility = user.organizationId
    ? or(eq(projectTemplates.organizationId, user.organizationId), isNull(projectTemplates.organizationId))
    : isNull(projectTemplates.organizationId);
  const [template] = await db
    .select()
    .from(projectTemplates)
    .where(and(eq(projectTemplates.id, templateId), visibility));
  return template ?? null;
}
