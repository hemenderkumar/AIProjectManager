import { db } from "./db";
import { projectTemplates, projects, tasks, projectMembers } from "./db/schema";
import { eq, or, isNull } from "drizzle-orm";
import { canAccessProject } from "./tenancy";
import type { SessionUser } from "./auth";

// A template snapshot is a point-in-time copy: charter-relevant fields plus a task/phase
// skeleton. Kept as one jsonb blob rather than child tables — see the column comment on
// projectTemplates.snapshot in schema.ts.
export type TemplateSnapshot = {
  charter: {
    description: string | null;
    problemStatement: string | null;
    proposedSolution: string | null;
    expectedBenefits: string | null;
    program: string | null;
  };
  taskSkeleton: Array<{
    title: string;
    phase: string | null;
    priority: string;
    estimateHours: number | null;
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
    taskSkeleton: projectTasks.map((t) => ({
      title: t.title,
      phase: t.phase,
      priority: t.priority,
      estimateHours: t.estimateHours,
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

export async function createProjectFromTemplate(user: SessionUser, templateId: string, newProjectName: string) {
  const [template] = await db.select().from(projectTemplates).where(eq(projectTemplates.id, templateId));
  if (!template) return null;
  const snapshot = template.snapshot as TemplateSnapshot;

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
    })
    .returning();

  await db.insert(projectMembers).values({ projectId: created.id, userId: user.id });

  if (snapshot.taskSkeleton?.length) {
    await db.insert(tasks).values(
      snapshot.taskSkeleton.map((t) => ({
        projectId: created.id,
        title: t.title,
        phase: t.phase,
        priority: (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(t.priority) ? t.priority : "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
        estimateHours: t.estimateHours ?? 0,
      }))
    );
  }

  return created;
}
