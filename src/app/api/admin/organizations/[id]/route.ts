import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { deleteOrganizationData } from "@/lib/orgExport";
import { logAudit } from "@/lib/audit";

// Soft enable/disable + rename. isActive is the "hide without destroying" alternative to
// DELETE below — a disabled company drops out of org-picker dropdowns (see tenancy-facing
// list endpoints) but keeps its projects/users/history intact and can be flipped back on.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [before] = await db.select().from(organizations).where(eq(organizations.id, id));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if ("name" in body) {
    if (!String(body.name).trim()) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    patch.name = String(body.name).trim();
  }
  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
    patch.isActive = body.isActive;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No recognized fields in body" }, { status: 400 });

  const [updated] = await db.update(organizations).set(patch).where(eq(organizations.id, id)).returning();

  await logAudit({
    actor: admin,
    action: "organization.updated",
    entityType: "organization",
    entityId: id,
    organizationId: id,
    beforeValue: JSON.stringify(before),
    afterValue: JSON.stringify(updated),
    detail:
      "isActive" in patch
        ? `${admin.name} ${patch.isActive ? "re-enabled" : "disabled"} "${before.name}".`
        : `${admin.name} renamed "${before.name}" to "${updated.name}".`,
  });

  return NextResponse.json(updated);
}

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
