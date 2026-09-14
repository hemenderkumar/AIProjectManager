import crypto from "crypto";
import { db } from "./db";
import { emailIntakeRoutes, incidents, projects, users, organizations } from "./db/schema";
import { eq, and } from "drizzle-orm";
import type { SessionUser } from "./auth";
import { canAccessProject } from "./tenancy";
import { isValidAssigneeForOrg } from "./incidents";
import { dispatchWebhook } from "./webhooks";

// The domain Resend (or whichever provider) is actually configured to receive mail for --
// must match the inbound domain set up in that provider's dashboard (either a verified custom
// subdomain, or the auto-generated `<id>.resend.app`). This is deployment config, not a secret,
// so a plain env var with a documented fallback is enough -- see .env.example.
const INBOUND_EMAIL_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "in.executa.app";

export function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return slug || "org";
}

// Random suffix is what actually makes the address hard to guess -- the only thing gating who
// can file an incident via this address is knowing it, so it can't be a predictable pattern
// like "orgname@domain" (trivially guessable / enumerable).
function randomSuffix(): string {
  return crypto.randomBytes(4).toString("hex");
}

export async function listEmailRoutes(user: SessionUser) {
  const rows = await db
    .select({
      id: emailIntakeRoutes.id,
      inboundAddress: emailIntakeRoutes.inboundAddress,
      projectId: emailIntakeRoutes.projectId,
      projectName: projects.name,
      defaultSeverity: emailIntakeRoutes.defaultSeverity,
      defaultAssigneeUserId: emailIntakeRoutes.defaultAssigneeUserId,
      defaultAssigneeName: users.name,
      isActive: emailIntakeRoutes.isActive,
      createdAt: emailIntakeRoutes.createdAt,
      lastUsedAt: emailIntakeRoutes.lastUsedAt,
    })
    .from(emailIntakeRoutes)
    .leftJoin(projects, eq(emailIntakeRoutes.projectId, projects.id))
    .leftJoin(users, eq(emailIntakeRoutes.defaultAssigneeUserId, users.id))
    .where(eq(emailIntakeRoutes.organizationId, user.organizationId ?? ""));
  return rows;
}

export async function createEmailRoute(
  user: SessionUser,
  options: { projectId?: string | null; defaultSeverity?: string; defaultAssigneeUserId?: string | null }
) {
  if (!user.organizationId) throw new Error("Email intake is only available for a client organization, not an internal staff account.");
  if (options.projectId) {
    const allowed = await canAccessProject(user, options.projectId);
    if (!allowed) throw new Error("You don't have access to that project.");
  }
  if (options.defaultAssigneeUserId) {
    const allowed = await isValidAssigneeForOrg(options.defaultAssigneeUserId, user.organizationId);
    if (!allowed) throw new Error("defaultAssigneeUserId is not a valid user for your organization.");
  }

  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, user.organizationId));
  const inboundAddress = `${slugify(org?.name || "org")}-${randomSuffix()}@${INBOUND_EMAIL_DOMAIN}`;

  const [created] = await db
    .insert(emailIntakeRoutes)
    .values({
      organizationId: user.organizationId,
      projectId: options.projectId || null,
      inboundAddress,
      defaultSeverity: (options.defaultSeverity || "MEDIUM") as (typeof emailIntakeRoutes.$inferInsert)["defaultSeverity"],
      defaultAssigneeUserId: options.defaultAssigneeUserId || null,
      createdBy: user.name,
    })
    .returning();
  return created;
}

function canManageEmailRoute(user: SessionUser, route: { organizationId: string }): boolean {
  if (user.role === "ADMIN") return true;
  return route.organizationId === (user.organizationId ?? null);
}

export async function updateEmailRoute(
  user: SessionUser,
  id: string,
  updates: { projectId?: string | null; defaultSeverity?: string; defaultAssigneeUserId?: string | null; isActive?: boolean }
) {
  const [route] = await db.select().from(emailIntakeRoutes).where(eq(emailIntakeRoutes.id, id));
  if (!route) throw new Error("Email intake address not found.");
  if (!canManageEmailRoute(user, route)) throw new Error("You don't have access to that email intake address.");

  const patch: Record<string, unknown> = {};
  if (updates.projectId !== undefined) {
    if (updates.projectId) {
      const allowed = await canAccessProject(user, updates.projectId);
      if (!allowed) throw new Error("You don't have access to that project.");
    }
    patch.projectId = updates.projectId || null;
  }
  if (updates.defaultSeverity !== undefined) {
    patch.defaultSeverity = updates.defaultSeverity;
  }
  if (updates.defaultAssigneeUserId !== undefined) {
    if (updates.defaultAssigneeUserId) {
      const allowed = await isValidAssigneeForOrg(updates.defaultAssigneeUserId, route.organizationId);
      if (!allowed) throw new Error("defaultAssigneeUserId is not a valid user for this address's organization.");
    }
    patch.defaultAssigneeUserId = updates.defaultAssigneeUserId || null;
  }
  if (updates.isActive !== undefined) {
    patch.isActive = updates.isActive;
  }

  if (Object.keys(patch).length === 0) return route;
  const [updated] = await db.update(emailIntakeRoutes).set(patch).where(eq(emailIntakeRoutes.id, id)).returning();
  return updated;
}

export async function deleteEmailRoute(user: SessionUser, id: string) {
  const [route] = await db.select().from(emailIntakeRoutes).where(eq(emailIntakeRoutes.id, id));
  if (!route) throw new Error("Email intake address not found.");
  if (!canManageEmailRoute(user, route)) throw new Error("You don't have access to that email intake address.");
  await db.update(emailIntakeRoutes).set({ isActive: false }).where(eq(emailIntakeRoutes.id, id));
}

// Looked up by the inbound webhook on every received email -- the "to" address is the only
// thing that says which organization/project this mail belongs to, so an unmatched or
// deactivated address must be treated as "reject silently," not "guess a default."
export async function findActiveRouteByAddress(address: string) {
  const [route] = await db
    .select()
    .from(emailIntakeRoutes)
    .where(and(eq(emailIntakeRoutes.inboundAddress, address.toLowerCase().trim()), eq(emailIntakeRoutes.isActive, true)));
  return route ?? null;
}

export function extractEmailAddress(fromHeader: string): string {
  // "Jane Doe <jane@acme.com>" -> "jane@acme.com"; a bare "jane@acme.com" passes through.
  const match = fromHeader.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader).trim().toLowerCase();
}

export type InboundEmailData = {
  from: string;
  subject: string;
  text: string | null;
  html: string | null;
};

// The actual "no code" incident-creation path: an email arrives at a route's address, and this
// turns it into an incident using that route's configured defaults. Mirrors the shape of the
// public API's POST /api/public/v1/incidents (severity, escalation stamp, createdVia* audit
// column, INCIDENT_CREATED webhook) so an incident's origin doesn't change how it behaves
// downstream.
export async function createIncidentFromEmail(route: typeof emailIntakeRoutes.$inferSelect, email: InboundEmailData) {
  const senderAddress = extractEmailAddress(email.from);
  const [matchedUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, senderAddress), eq(users.organizationId, route.organizationId)));

  const severity = route.defaultSeverity;
  const [created] = await db
    .insert(incidents)
    .values({
      projectId: route.projectId,
      title: email.subject?.trim() || "(no subject)",
      description: email.text || email.html || null,
      severity,
      status: "OPEN",
      reportedBy: email.from,
      reportedByUserId: matchedUser?.id || null,
      assigneeUserId: route.defaultAssigneeUserId,
      escalatedAt: severity === "CRITICAL" ? new Date() : null,
      createdViaEmailRouteId: route.id,
    })
    .returning();

  db.update(emailIntakeRoutes).set({ lastUsedAt: new Date() }).where(eq(emailIntakeRoutes.id, route.id)).catch(() => {});

  await dispatchWebhook(route.organizationId, "INCIDENT_CREATED", {
    id: created.id, title: created.title, severity: created.severity, status: created.status, projectId: created.projectId, source: "email",
  });

  return created;
}
