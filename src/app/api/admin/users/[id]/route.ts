import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const [before] = await db.select({ role: users.role, name: users.name }).from(users).where(eq(users.id, id));

  const update: Record<string, unknown> = {};
  if (body.name) update.name = body.name;
  if (body.role) update.role = body.role;
  if (body.resourceId !== undefined) update.resourceId = body.resourceId || null;
  if (body.organizationId !== undefined) update.organizationId = body.organizationId || null;
  if (body.password) update.passwordHash = await hashPassword(body.password);

  const [updated] = await db.update(users).set(update).where(eq(users.id, id)).returning({
    id: users.id, name: users.name, email: users.email, role: users.role, organizationId: users.organizationId,
  });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.role && before && before.role !== body.role) {
    await logAudit({
      actor: admin, action: "user.role_changed", entityType: "user", entityId: id,
      organizationId: updated.organizationId,
      detail: `${admin.name} changed ${updated.name}'s role from ${before.role} to ${updated.role}.`,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const [existing] = await db.select({ name: users.name, organizationId: users.organizationId }).from(users).where(eq(users.id, id));
  await db.delete(users).where(eq(users.id, id));
  await logAudit({
    actor: admin, action: "user.deleted", entityType: "user", entityId: id,
    organizationId: existing?.organizationId ?? null, detail: `${admin.name} deleted user "${existing?.name ?? id}".`,
  });
  return NextResponse.json({ ok: true });
}
