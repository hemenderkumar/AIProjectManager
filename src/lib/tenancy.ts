import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { projects, projectMembers } from "./db/schema";
import { requireRole, type SessionUser } from "./auth";

// Visibility scope is derived from role, not stored separately — one fact to keep in sync
// instead of two. See the comment on userRoleEnum in db/schema.ts for the reasoning.
export type Scope = "GLOBAL" | "ORGANIZATION" | "PROJECT";

export function scopeFor(role: SessionUser["role"]): Scope {
  if (role === "ADMIN") return "GLOBAL";
  if (role === "SUPER_USER") return "ORGANIZATION";
  return "PROJECT"; // PM, CONTRIBUTOR, VIEWER
}

// True only for your own team (not tied to any client company) — gates internal-only
// operational tools (Resources roster, Rate Cards) that no client, regardless of role,
// should see. A SUPER_USER is a client-company user even though their scope is broad.
export function isInternalStaff(user: SessionUser): boolean {
  return user.organizationId == null;
}

// The single source of truth for "can this user see this project." ADMIN: always. SUPER_USER:
// only if the project belongs to their organization. PM/CONTRIBUTOR/VIEWER: only if they're
// an explicit member of that specific project — this applies to internal staff too, so one
// internal PM staffed on Client A's project still can't see Client B's project.
export async function canAccessProject(user: SessionUser, projectId: string): Promise<boolean> {
  if (user.role === "ADMIN") return true;

  const [project] = await db
    .select({ organizationId: projects.organizationId })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return false;

  if (user.role === "SUPER_USER") {
    return !!user.organizationId && project.organizationId === user.organizationId;
  }

  const [membership] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)));
  return !!membership;
}

// Combines the existing role-tier check with the project-level scope check — drop-in
// replacement for `requireRole(min)` on any route nested under /api/projects/[id]/**.
export async function requireProjectAccess(min: SessionUser["role"], projectId: string) {
  const user = await requireRole(min);
  if (!user) return null;
  const ok = await canAccessProject(user, projectId);
  return ok ? user : null;
}

// Drop-in replacement for `requireRole(min)` on routes that are internal-only regardless
// of permission tier (Resources roster) — blocks any client-company user (incl.
// a SUPER_USER) even though their role tier might otherwise qualify.
export async function requireInternal(min: SessionUser["role"]) {
  const user = await requireRole(min);
  if (!user) return null;
  return isInternalStaff(user) ? user : null;
}

// Rate Cards are scoped per company, not internal-only: ADMIN can see/edit any company's
// rates (or everything, if none is specified); a SUPER_USER is confined to their own
// company's rates; internal Keel staff (no organization) get the global default list.
// Any other role — including a PM/CONTRIBUTOR/VIEWER inside a client org, which covers a
// self-registered "individual" account — has no rate card access at all: that's company-wide
// configuration, not something a single project-scoped teammate should see or change.
export type RateCardScope =
  | { kind: "ALL" } // ADMIN with no specific company requested — unfiltered
  | { kind: "ORG"; organizationId: string | null }; // a specific company, or null = global defaults

export async function requireRateCardAccess(
  min: SessionUser["role"],
  requestedOrgId?: string | null
): Promise<{ user: SessionUser; scope: RateCardScope } | null> {
  const user = await requireRole(min);
  if (!user) return null;

  if (user.role === "ADMIN") {
    return { user, scope: requestedOrgId !== undefined ? { kind: "ORG", organizationId: requestedOrgId } : { kind: "ALL" } };
  }
  if (user.role === "SUPER_USER") {
    if (!user.organizationId) return null;
    return { user, scope: { kind: "ORG", organizationId: user.organizationId } };
  }
  if (isInternalStaff(user)) {
    return { user, scope: { kind: "ORG", organizationId: null } };
  }
  return null;
}

// Some records (incidents, etc.) optionally link to a project via a nullable projectId.
// When linked, visibility follows the project's own access rule. When unlinked (a
// general/unassigned record not tied to any client project), treat it as internal-only —
// a client-company user has no business seeing a portfolio-wide, unattributed record.
export async function canAccessOptionalProject(user: SessionUser, projectId: string | null): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (projectId == null) return isInternalStaff(user);
  return canAccessProject(user, projectId);
}

// Filters a list of already-fetched projects down to what `user` is allowed to see. Used by
// the portfolio-wide list/summary queries (dashboard, /projects, /ideation, /execution,
// /support). No user (e.g. a scheduled cron job with no request context) means unfiltered —
// callers that ARE user-facing must always pass the current user.
export async function filterProjectsForUser<T extends { id: string; organizationId: string | null }>(
  allProjects: T[],
  user?: SessionUser | null
): Promise<T[]> {
  if (!user) return allProjects;
  if (user.role === "ADMIN") return allProjects;
  if (user.role === "SUPER_USER") {
    return user.organizationId ? allProjects.filter((p) => p.organizationId === user.organizationId) : [];
  }
  const memberships = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, user.id));
  const allowedIds = new Set(memberships.map((m) => m.projectId));
  return allProjects.filter((p) => allowedIds.has(p.id));
}
