import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "./db";
import { incidents, problems, tasks, incidentUpdates } from "./db/schema";
import { canAccessOptionalProject, isInternalStaff, listVisibleProjects } from "./tenancy";
import { listIncidents } from "./incidents";
import { findSimilarIncidents, resolutionEvidence, detectRecurrence, type IncidentLike } from "./incidentSimilarity";
import type { SessionUser } from "./auth";

// ---- visibility -------------------------------------------------------------------------
// A problem follows its project's access rule; unlinked problems are visible within the owning
// organization (or to internal staff when the org is null).
export async function listProblems(user: SessionUser) {
  if (user.role === "ADMIN") return db.select().from(problems).orderBy(desc(problems.createdAt));
  const visible = await listVisibleProjects(user);
  const ids = visible.map((p) => p.id);
  const conds = [];
  if (ids.length) conds.push(inArray(problems.projectId, ids));
  conds.push(
    user.organizationId
      ? and(isNull(problems.projectId), eq(problems.organizationId, user.organizationId))
      : and(isNull(problems.projectId), isNull(problems.organizationId)),
  );
  return db.select().from(problems).where(or(...conds)).orderBy(desc(problems.createdAt));
}

async function canAccessProblem(user: SessionUser, p: typeof problems.$inferSelect): Promise<boolean> {
  if (p.projectId) return canAccessOptionalProject(user, p.projectId);
  if (user.role === "ADMIN") return true;
  return (p.organizationId ?? null) === (user.organizationId ?? null);
}

export async function getProblem(user: SessionUser, id: string) {
  const [p] = await db.select().from(problems).where(eq(problems.id, id));
  if (!p) return { error: "not_found" as const };
  if (!(await canAccessProblem(user, p))) return { error: "forbidden" as const };
  const linked = await db.select().from(incidents).where(eq(incidents.problemId, id)).orderBy(desc(incidents.reportedAt));
  return { problem: p, incidents: linked };
}

// ---- create from incident(s) ------------------------------------------------------------
export async function createProblemFromIncidents(
  user: SessionUser,
  incidentIds: string[],
  overrides: { title?: string; description?: string } = {},
) {
  if (!incidentIds.length) return { error: "no_incidents" as const };
  const rows = await db.select().from(incidents).where(inArray(incidents.id, incidentIds));
  if (rows.length !== incidentIds.length) return { error: "not_found" as const };
  for (const r of rows) {
    if (!(await canAccessOptionalProject(user, r.projectId))) return { error: "forbidden" as const };
  }
  const projectId = rows.every((r) => r.projectId === rows[0].projectId) ? rows[0].projectId : null;
  const worst = rows.find((r) => r.severity === "CRITICAL") ?? rows.find((r) => r.severity === "HIGH") ?? rows[0];

  const [problem] = await db
    .insert(problems)
    .values({
      organizationId: user.organizationId ?? null,
      projectId,
      title: overrides.title?.trim() || rows[0].title,
      description:
        overrides.description?.trim() ||
        `Raised from ${rows.length} incident${rows.length === 1 ? "" : "s"}. Highest severity: ${worst.severity}.\n\n` +
          rows.map((r) => `• ${r.title}`).join("\n"),
      createdBy: user.name,
    })
    .returning();

  await db.update(incidents).set({ problemId: problem.id }).where(inArray(incidents.id, incidentIds));
  return { problem };
}

export async function linkIncidentToProblem(user: SessionUser, incidentId: string, problemId: string | null) {
  const [inc] = await db.select().from(incidents).where(eq(incidents.id, incidentId));
  if (!inc) return { error: "not_found" as const };
  if (!(await canAccessOptionalProject(user, inc.projectId))) return { error: "forbidden" as const };
  if (problemId) {
    const got = await getProblem(user, problemId);
    if (got.error) return { error: got.error };
  }
  const [updated] = await db.update(incidents).set({ problemId }).where(eq(incidents.id, incidentId)).returning();
  return { incident: updated };
}

const PROBLEM_PATCH_FIELDS = ["title", "description", "rootCause", "workaround", "runbook", "permanentFix", "status"] as const;
const PROBLEM_STATUSES = new Set(["INVESTIGATING", "KNOWN_ERROR", "RESOLVED"]);

export async function patchProblem(user: SessionUser, id: string, body: Record<string, unknown>) {
  const got = await getProblem(user, id);
  if (got.error) return { error: got.error };
  const existing = got.problem;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of PROBLEM_PATCH_FIELDS) {
    if (!(k in body)) continue;
    const v = body[k];
    if (k === "status") {
      if (typeof v !== "string" || !PROBLEM_STATUSES.has(v)) return { error: "invalid_status" as const };
      update.status = v;
    } else {
      update[k] = typeof v === "string" ? v.trim() || null : null;
    }
  }
  if (update.status === "RESOLVED" && existing.status !== "RESOLVED") update.resolvedAt = new Date();
  if (update.status && update.status !== "RESOLVED") update.resolvedAt = null;
  // A known error must carry a workaround or runbook, otherwise there is nothing to surface.
  const nextStatus = (update.status as string | undefined) ?? existing.status;
  const nextWorkaround = "workaround" in update ? update.workaround : existing.workaround;
  const nextRunbook = "runbook" in update ? update.runbook : existing.runbook;
  if (nextStatus === "KNOWN_ERROR" && !nextWorkaround && !nextRunbook) return { error: "known_error_needs_workaround" as const };

  const [updated] = await db.update(problems).set(update).where(eq(problems.id, id)).returning();
  return { problem: updated };
}

// Creates the tracked task that delivers the permanent fix (once), in the linked project.
export async function createProblemFixTask(user: SessionUser, id: string) {
  const got = await getProblem(user, id);
  if (got.error) return { error: got.error };
  const p = got.problem;
  if (!p.projectId) return { error: "no_project" as const };
  if (p.fixTaskId) return { error: "already_linked" as const, fixTaskId: p.fixTaskId };
  const worst = got.incidents.find((i) => i.severity === "CRITICAL") ? "CRITICAL" : got.incidents.find((i) => i.severity === "HIGH") ? "HIGH" : "MEDIUM";
  const [task] = await db
    .insert(tasks)
    .values({
      projectId: p.projectId,
      title: `Permanent fix: ${p.title}`,
      description: [p.rootCause && `Root cause: ${p.rootCause}`, p.permanentFix && `Fix: ${p.permanentFix}`, p.workaround && `Workaround in place: ${p.workaround}`]
        .filter(Boolean)
        .join("\n\n") || p.description,
      priority: worst as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    })
    .returning();
  await db.update(problems).set({ fixTaskId: task.id, updatedAt: new Date() }).where(eq(problems.id, id));
  return { task };
}

// ---- suggestions from history -----------------------------------------------------------
// For one incident: similar past incidents, how they were resolved, and any known error whose
// workaround already applies.
export async function suggestionsForIncident(user: SessionUser, incidentId: string) {
  const [inc] = await db.select().from(incidents).where(eq(incidents.id, incidentId));
  if (!inc) return { error: "not_found" as const };
  if (!(await canAccessOptionalProject(user, inc.projectId))) return { error: "forbidden" as const };

  const visible = (await listIncidents(user)) as IncidentLike[];
  const similar = findSimilarIncidents(inc as IncidentLike, visible);
  const evidence = resolutionEvidence(similar);

  // Known errors: problems (visible to the user) that are KNOWN_ERROR and share the linked
  // problem of any similar incident, or are directly linked to this incident.
  const visibleProblems = await listProblems(user);
  const candidateProblemIds = new Set<string>([
    ...(inc.problemId ? [inc.problemId] : []),
    ...similar.map((s) => s.incident.problemId).filter((x): x is string => !!x),
  ]);
  const knownErrors = visibleProblems.filter((p) => candidateProblemIds.has(p.id) && p.status === "KNOWN_ERROR");

  const median = (() => {
    const mins = evidence.map((e) => e.minutesToResolve).filter((m): m is number => m != null).sort((a, b) => a - b);
    return mins.length ? mins[Math.floor(mins.length / 2)] : null;
  })();

  return {
    similar: similar.map((s) => ({
      id: s.incident.id, title: s.incident.title, status: s.incident.status, severity: s.incident.severity,
      score: Math.round(s.score * 100), sameProject: s.sameProject, problemId: s.incident.problemId ?? null,
    })),
    evidence,
    knownErrors: knownErrors.map((p) => ({ id: p.id, title: p.title, workaround: p.workaround, runbook: p.runbook, rootCause: p.rootCause })),
    medianMinutesToResolve: median,
  };
}

// ---- recurrence candidates --------------------------------------------------------------
export async function recurrenceCandidates(user: SessionUser) {
  const all = (await listIncidents(user)) as IncidentLike[];
  return detectRecurrence(all);
}

// Timeline helper used when a problem is opened/updated so affected incidents show why.
export async function noteOnLinkedIncidents(problemId: string, authorName: string, body: string, visibility: "INTERNAL" | "PUBLIC" = "INTERNAL") {
  const linked = await db.select({ id: incidents.id }).from(incidents).where(eq(incidents.problemId, problemId));
  if (!linked.length) return;
  await db.insert(incidentUpdates).values(linked.map((l) => ({ incidentId: l.id, authorName, body, visibility })));
}

export { isInternalStaff };
