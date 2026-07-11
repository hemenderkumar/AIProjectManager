import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { divisions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Scoped to (id AND organizationId = caller's org) so a SUPER_USER can never delete
// another organization's division even by guessing an id.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [existing] = await db
    .select({ id: divisions.id, name: divisions.name })
    .from(divisions)
    .where(and(eq(divisions.id, id), eq(divisions.organizationId, user.organizationId)));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(divisions).where(and(eq(divisions.id, id), eq(divisions.organizationId, user.organizationId)));

  await logAudit({
    actor: user, action: "division.deleted", entityType: "division", entityId: id,
    organizationId: user.organizationId, detail: `${user.name} removed division "${existing.name}".`,
  });

  return NextResponse.json({ ok: true });
}
