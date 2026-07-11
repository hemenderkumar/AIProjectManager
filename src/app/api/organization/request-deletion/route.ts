import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Step 1 of the Request -> Admin confirms deletion flow: a SUPER_USER flags their own
// organization for deletion. Nothing is deleted here — this only records the request for
// an ADMIN to review and confirm (or dismiss) from the Admin page.
export async function POST() {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [org] = await db.select().from(organizations).where(eq(organizations.id, user.organizationId));
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (org.deletionRequestedAt) {
    return NextResponse.json({ error: "A deletion request is already pending for your organization." }, { status: 409 });
  }

  const [updated] = await db
    .update(organizations)
    .set({ deletionRequestedAt: new Date(), deletionRequestedBy: `${user.name} <${user.email}>` })
    .where(eq(organizations.id, user.organizationId))
    .returning();

  await logAudit({
    actor: user,
    action: "organization.deletion_requested",
    entityType: "organization",
    entityId: user.organizationId,
    organizationId: user.organizationId,
    detail: `${user.name} requested deletion of "${org.name}" and all of its data.`,
  });

  return NextResponse.json(updated);
}

// Lets the SUPER_USER who requested deletion change their mind before an ADMIN acts on it.
export async function DELETE() {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [updated] = await db
    .update(organizations)
    .set({ deletionRequestedAt: null, deletionRequestedBy: null })
    .where(eq(organizations.id, user.organizationId))
    .returning();

  await logAudit({
    actor: user,
    action: "organization.deletion_request_cancelled",
    entityType: "organization",
    entityId: user.organizationId,
    organizationId: user.organizationId,
    detail: `${user.name} cancelled their organization's pending deletion request.`,
  });

  return NextResponse.json(updated);
}
