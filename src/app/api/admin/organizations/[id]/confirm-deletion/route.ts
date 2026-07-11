import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { deleteOrganizationData } from "@/lib/orgExport";
import { logAudit } from "@/lib/audit";

// Step 2 of the Request -> Admin confirms flow: ADMIN reviews a pending deletion request
// and confirms it. This is the only place the actual, irreversible delete happens —
// every project, task, and user belonging to the organization, then the organization
// itself. Requires an actual pending request; an admin can't delete an org that never
// asked (use the regular organization management flow for that, if one exists).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!org.deletionRequestedAt) {
    return NextResponse.json({ error: "This organization has no pending deletion request." }, { status: 409 });
  }

  const result = await deleteOrganizationData(id);

  await logAudit({
    actor: admin,
    action: "organization.deleted",
    entityType: "organization",
    entityId: id,
    organizationId: null, // the org no longer exists — don't reference a dangling FK
    detail: `${admin.name} confirmed deletion of "${org.name}" (requested by ${org.deletionRequestedBy ?? "unknown"}). ${result.deletedProjectCount} project(s) deleted.`,
  });

  return NextResponse.json({ ok: true, ...result });
}
