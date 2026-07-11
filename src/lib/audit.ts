import { db } from "./db";
import { auditLog } from "./db/schema";
import type { SessionUser } from "./auth";

/** Records one row in the append-only audit log. Never throws — an audit-log write
 * failure should never block the underlying action from completing. Call this after the
 * action succeeds (so we log what actually happened), not before. */
export async function logAudit(opts: {
  actor: SessionUser | null;
  action: string; // e.g. "organization.deletion_requested"
  entityType?: string; // e.g. "organization"
  entityId?: string;
  organizationId?: string | null;
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
      detail: opts.detail,
    });
  } catch (err) {
    console.error("audit log write failed:", err);
  }
}
