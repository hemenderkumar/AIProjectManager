import { NextResponse } from "next/server";
import { requireInternal } from "@/lib/tenancy";
import { listVisibleProjects } from "@/lib/tenancy";
import {
  computeSkillCapacityForecast,
  computeSkillForecastByProject,
  computeSkillHeadcountForecast,
  totalAllocationByResource,
  type SkillDemandTask,
} from "@/lib/forecast";
import { db } from "@/lib/db";
import { tasks, resources, projectResources, rateCards, skillRoleMap } from "@/lib/db/schema";
import { and, inArray, isNull, ne } from "drizzle-orm";

// Internal-only, same gate as the Resources roster and Rate Cards — this surfaces staff
// names, allocation %, and per-hour cost, none of which a client-company SUPER_USER should
// see (see tenancy.ts's requireInternal comment). Task visibility still follows the caller's
// own project scope (listVisibleProjects), so a non-ADMIN internal PM only forecasts against
// the projects they're actually staffed on, same as everywhere else in the app.
export async function GET() {
  const user = await requireInternal("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const visibleProjects = await listVisibleProjects(user);
  const activeProjects = visibleProjects.filter((p) => p.stage !== "CLOSED");
  const activeProjectIds = activeProjects.map((p) => p.id);
  const projectNameById = new Map(activeProjects.map((p) => [p.id, p.name]));

  if (activeProjectIds.length === 0) {
    const empty = computeSkillCapacityForecast([], [], new Map(), []);
    return NextResponse.json({ ...empty, byProject: [], headcount: [] });
  }

  const [unstaffedTaskRows, resourceRows, allocationRows, rateCardRows, skillRoleRows] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(and(inArray(tasks.projectId, activeProjectIds), isNull(tasks.assigneeId), ne(tasks.status, "DONE"))),
    db.select().from(resources),
    db.select().from(projectResources).where(inArray(projectResources.projectId, activeProjectIds)),
    db.select().from(rateCards).where(isNull(rateCards.organizationId)),
    db.select().from(skillRoleMap),
  ]);
  const skillRoleById = new Map(skillRoleRows.map((r) => [r.skill, r.role]));

  // AI-executed and vendor-executed tasks aren't candidates for internal staffing at all — the
  // former runs itself, the latter is meant to go out to ProjectRequesta/an external vendor —
  // so counting them here would forecast a "gap" that was never going to be filled by a
  // resource on this roster in the first place. Unclassified (null) tasks are kept, same
  // "assume internal until told otherwise" default the rest of the app uses.
  const demandTasks: SkillDemandTask[] = unstaffedTaskRows
    .filter((t) => t.executionSource !== "AI" && t.executionSource !== "VENDOR")
    .map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: projectNameById.get(t.projectId) ?? "Unknown project",
      title: t.title,
      requiredSkills: t.requiredSkills,
      estimateHours: t.estimateHours,
      dueDate: t.dueDate,
    }));

  const allocationPercentByResource = totalAllocationByResource(
    allocationRows.map((a) => ({ resourceId: a.resourceId, allocationPercent: a.allocationPercent }))
  );

  const forecast = computeSkillCapacityForecast(
    demandTasks,
    resourceRows,
    allocationPercentByResource,
    rateCardRows,
    undefined,
    skillRoleById
  );

  // Project-first and time-phased views re-attribute this same skill-level gap data rather
  // than recomputing coverage independently -- see the comments on both functions in
  // lib/forecast.ts for why (capacity is a shared roster resource, not owned per project).
  const byProject = computeSkillForecastByProject(demandTasks, forecast.skills);
  const headcount = computeSkillHeadcountForecast(demandTasks, forecast.skills);

  return NextResponse.json({ ...forecast, byProject: byProject.projects, headcount });
}
