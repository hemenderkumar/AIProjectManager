import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { deleteOrganizationData } from "@/lib/orgExport";
import { logAudit } from "@/lib/audit";

// Direct admin-initiated delete — distinct from the Request -> Admin confirms self-service
// flow in confirm-deletion/route.ts (which requires a SUPER_USER to have asked first). An
// ADMIN doesn't need to wait for that: they can remove a company outright, e.g. one created
// by mistake or that never needed the client-facing consent flow.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await deleteOrganizationData(id);

  await logAudit({
    actor: admin,
    action: "organization.deleted",
    entityType: "organization",
    entityId: id,
    organizationId: null, // the org no longer exists — don't reference a dangling FK
    detail: `${admin.name} directly deleted "${org.name}". ${result.deletedProjectCount} project(s) deleted.`,
  });

  return NextResponse.json({ ok: true, ...result });
}
