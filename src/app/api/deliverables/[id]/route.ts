import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliverables, deliverableTestCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

async function loadDeliverable(id: string) {
  const [d] = await db.select().from(deliverables).where(eq(deliverables.id, id));
  return d ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const d = await loadDeliverable(id);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("VIEWER", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const testCases = await db
    .select()
    .from(deliverableTestCases)
    .where(eq(deliverableTestCases.deliverableId, id));

  return NextResponse.json({ ...d, testCases: testCases.sort((a, b) => a.sequence - b.sequence) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const d = await loadDeliverable(id);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("CONTRIBUTOR", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) update.title = body.title;
  if (body.content !== undefined) update.content = body.content;
  if (body.diagram !== undefined) update.diagram = body.diagram;
  if (body.status !== undefined) update.status = body.status;
  // Approval is a real moment worth recording, not just another status edit — always stamped
  // from the acting user server-side, never client-supplied, so it can't be spoofed.
  if (body.status === "APPROVED" && d.status !== "APPROVED") {
    update.approvedAt = new Date();
    update.approvedBy = user.name;
  }

  const [updated] = await db.update(deliverables).set(update).where(eq(deliverables.id, id)).returning();

  if (body.status && body.status !== d.status) {
    await logAudit({
      actor: user, action: "deliverable.status_changed", entityType: "deliverable", entityId: id,
      detail: `${user.name} moved "${updated.title}" to ${updated.status}.`,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const d = await loadDeliverable(id);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("CONTRIBUTOR", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(deliverables).where(eq(deliverables.id, id));
  await logAudit({
    actor: user, action: "deliverable.deleted", entityType: "deliverable", entityId: id,
    detail: `${user.name} deleted deliverable "${d.title}".`,
  });
  return NextResponse.json({ ok: true });
}
