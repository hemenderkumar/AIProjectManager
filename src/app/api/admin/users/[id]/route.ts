import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole, hashPassword } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

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
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
