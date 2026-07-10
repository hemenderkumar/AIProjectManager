import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, resources, projects, projectResources } from "@/lib/db/schema";

const DEFAULT_WEEKLY_CAPACITY = 40;

/**
 * Recomputes each resource's allocationPercent on a project from their actual assigned
 * task effort, instead of leaving it as a manually-typed, disconnected number.
 *
 * allocationPercent = (that resource's total assigned estimateHours on this project)
 *                     / (project duration in weeks * that resource's weekly capacity)
 *                     * 100, capped at 100.
 *
 * If the project has no start/target-end date set yet, duration falls back to 1 week —
 * i.e. the allocation reflects "how much of a single week's capacity this workload alone
 * would take", which is still a meaningful signal (and gets more accurate once dates exist).
 *
 * Only touches resources that currently have assigned task hours > 0 on this project —
 * it won't zero out or remove allocations for resources who simply don't have tasks
 * assigned to them (they may be intentionally allocated ahead of tasks existing).
 */
export async function syncAllocationsFromEffort(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return;

  const projectTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNotNull(tasks.assigneeId)));

  const hoursByResource = new Map<string, number>();
  for (const t of projectTasks) {
    if (!t.assigneeId) continue;
    hoursByResource.set(t.assigneeId, (hoursByResource.get(t.assigneeId) ?? 0) + (t.estimateHours ?? 0));
  }
  if (hoursByResource.size === 0) return;

  let weeks = 1;
  if (project.startDate && project.targetEndDate) {
    const days = (project.targetEndDate.getTime() - project.startDate.getTime()) / 86400000;
    weeks = Math.max(1, days / 7);
  }

  const allResources = await db.select().from(resources);
  const existingAllocations = await db
    .select()
    .from(projectResources)
    .where(eq(projectResources.projectId, projectId));

  for (const [resourceId, hours] of hoursByResource.entries()) {
    const resource = allResources.find((r) => r.id === resourceId);
    const capacity = resource?.capacityHoursPerWk || DEFAULT_WEEKLY_CAPACITY;
    const allocationPercent = Math.min(100, Math.max(1, Math.round((hours / (weeks * capacity)) * 100)));

    const existing = existingAllocations.find((a) => a.resourceId === resourceId);
    if (existing) {
      await db
        .update(projectResources)
        .set({ allocationPercent })
        .where(eq(projectResources.id, existing.id));
    } else {
      await db.insert(projectResources).values({ projectId, resourceId, allocationPercent });
    }
  }
}
