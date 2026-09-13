import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hiringRequisitions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireInternal } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

const editableFields = ["skill", "role", "targetHeadcount", "sourcingType", "status", "targetStartDate", "notes", "filledByResourceId"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireInternal("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [existing] = await db.select().from(hiringRequisitions).where(eq(hiringRequisitions.id, id));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const update: Record<string, unknown> = {};
  for (const key of editableFields) {
    if (!(key in body)) continue;
    if (key === "targetStartDate") {
      update[key] = body[key] ? new Date(body[key]) : null;
    } else {
      update[key] = body[key] === "" ? null : body[key];
    }
  }
  // Moving to FILLED is a real moment worth recording, not just another field edit --
  // stamped server-side so it can't be backdated or spoofed from the client.
  if (body.status === "FILLED" && existing.status !== "FILLED") {
    update.filledAt = new Date();
  }
  if (body.status && body.status !== "FILLED") {
    update.filledAt = null;
    if (!("filledByResourceId" in body)) update.filledByResourceId = null;
  }

  const [updated] = await db.update(hiringRequisitions).set(update).where(eq(hiringRequisitions.id, id)).returning();

  await logAudit({
    actor: user,
    action: "hiring_requisition.updated",
    entityType: "hiring_requisition",
    entityId: id,
    detail: `${user.name} updated the ${updated.skill} requisition${body.status ? ` (status: ${updated.status})` : ""}.`,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireInternal("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [existing] = await db.select().from(hiringRequisitions).where(eq(hiringRequisitions.id, id));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(hiringRequisitions).where(eq(hiringRequisitions.id, id));
  await logAudit({
    actor: user,
    action: "hiring_requisition.deleted",
    entityType: "hiring_requisition",
    entityId: id,
    detail: `${user.name} deleted the ${existing.skill} requisition.`,
  });
  return NextResponse.json({ ok: true });
}
