import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stakeholders } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (body.name) update.name = body.name;
  if (body.title !== undefined) update.title = body.title || null;
  if (body.email !== undefined) update.email = body.email || null;
  if (body.divisionId !== undefined) update.divisionId = body.divisionId || null;

  const [updated] = await db
    .update(stakeholders)
    .set(update)
    .where(and(eq(stakeholders.id, id), eq(stakeholders.organizationId, user.organizationId)))
    .returning();
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [existing] = await db
    .select({ id: stakeholders.id, name: stakeholders.name })
    .from(stakeholders)
    .where(and(eq(stakeholders.id, id), eq(stakeholders.organizationId, user.organizationId)));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(stakeholders).where(and(eq(stakeholders.id, id), eq(stakeholders.organizationId, user.organizationId)));

  await logAudit({
    actor: user, action: "stakeholder.deleted", entityType: "stakeholder", entityId: id,
    organizationId: user.organizationId, detail: `${user.name} removed stakeholder "${existing.name}".`,
  });

  return NextResponse.json({ ok: true });
}
