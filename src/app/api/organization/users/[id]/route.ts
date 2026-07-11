import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const ASSIGNABLE_ROLES = ["PM", "CONTRIBUTOR", "VIEWER"] as const;

// Every lookup is scoped to (id AND organizationId = caller's org) so a SUPER_USER can
// never see or touch a user in a different organization — the WHERE clause itself is the
// security boundary here, not just a role check.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireRole("SUPER_USER");
  if (!actor || !actor.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [target] = await db
    .select({ id: users.id, name: users.name, role: users.role, organizationId: users.organizationId })
    .from(users)
    .where(and(eq(users.id, id), eq(users.organizationId, actor.organizationId)));
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role === "SUPER_USER" || target.role === "ADMIN") {
    return NextResponse.json({ error: "Only a Keel administrator can change an account owner's role." }, { status: 403 });
  }

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (body.name) update.name = body.name;
  if (body.role) {
    if (!ASSIGNABLE_ROLES.includes(body.role)) {
      return NextResponse.json({ error: "You can only assign PM, CONTRIBUTOR, or VIEWER." }, { status: 400 });
    }
    update.role = body.role;
  }
  if (body.divisionId !== undefined) update.divisionId = body.divisionId || null;

  const [updated] = await db
    .update(users)
    .set(update)
    .where(and(eq(users.id, id), eq(users.organizationId, actor.organizationId)))
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role, divisionId: users.divisionId });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.role && body.role !== target.role) {
    await logAudit({
      actor, action: "user.role_changed", entityType: "user", entityId: id,
      organizationId: actor.organizationId,
      detail: `${actor.name} changed ${updated.name}'s role from ${target.role} to ${updated.role}.`,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireRole("SUPER_USER");
  if (!actor || !actor.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [target] = await db
    .select({ id: users.id, name: users.name, role: users.role, organizationId: users.organizationId })
    .from(users)
    .where(and(eq(users.id, id), eq(users.organizationId, actor.organizationId)));
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role === "SUPER_USER" || target.role === "ADMIN") {
    return NextResponse.json({ error: "Only a Keel administrator can remove an account owner." }, { status: 403 });
  }

  await db.delete(users).where(and(eq(users.id, id), eq(users.organizationId, actor.organizationId)));

  await logAudit({
    actor, action: "user.deleted", entityType: "user", entityId: id,
    organizationId: actor.organizationId, detail: `${actor.name} removed ${target.name} from their organization.`,
  });

  return NextResponse.json({ ok: true });
}
