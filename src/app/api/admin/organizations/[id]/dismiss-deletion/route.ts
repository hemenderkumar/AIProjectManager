import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// ADMIN declines a pending deletion request without deleting anything — clears the flag
// so the organization goes back to normal. The requester can always ask again later.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [updated] = await db
    .update(organizations)
    .set({ deletionRequestedAt: null, deletionRequestedBy: null })
    .where(eq(organizations.id, id))
    .returning();

  await logAudit({
    actor: admin,
    action: "organization.deletion_dismissed",
    entityType: "organization",
    entityId: id,
    organizationId: id,
    detail: `${admin.name} dismissed the deletion request for "${org.name}" (requested by ${org.deletionRequestedBy ?? "unknown"}).`,
  });

  return NextResponse.json(updated);
}
