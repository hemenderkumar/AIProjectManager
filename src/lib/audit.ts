import { db } from "./db";
import { auditLog } from "./db/schema";
import type { SessionUser } from "./auth";

/** Records one row in the append-only audit log. Never throws — an audit-log write
 * failure should never block the underlying action from completing. Call this after the
 * action succeeds (so we log what actually happened), not before.
 *
 * `scOrganizationId`/`beforeValue`/`afterValue` back KeelConnect's audit requirement: every
 * Agreement/Payment state change and every permission (scOrgMembers) change must be
 * traceable with a before/after snapshot, not just an action string. Keel Deliver callers
 * can ignore these three fields entirely. before/after are passed as already-stringified
 * JSON (caller's choice of shape) rather than typed here, since the "before"/"after" shape
 * differs per entity type. */
export async function logAudit(opts: {
  actor: SessionUser | null;
  action: string; // e.g. "organization.deletion_requested"
  entityType?: string; // e.g. "organization"
  entityId?: string;
  organizationId?: string | null;
  scOrganizationId?: string | null;
  beforeValue?: string | null;
  afterValue?: string | null;
  detail?: string;
}) {
  try {
    await db.insert(auditLog).values({
      actorUserId: opts.actor?.id ?? null,
      actorName: opts.actor?.name ?? null,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      organizationId: opts.organizationId ?? null,
      scOrganizationId: opts.scOrganizationId ?? null,
      beforeValue: opts.beforeValue ?? null,
      afterValue: opts.afterValue ?? null,
      detail: opts.detail,
    });
  } catch (err) {
    console.error("audit log write failed:", err);
  }
}
