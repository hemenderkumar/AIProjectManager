import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

const editableFields = [
  "title", "vendorName", "vendorContactName", "vendorContactEmail", "status",
  "scope", "deliverablesSummary", "timeline", "fundingAmount", "fundingTerms",
  "risks", "issues", "content", "signedBy",
] as const;

async function loadSow(id: string) {
  const [sow] = await db.select().from(sows).where(eq(sows.id, id));
  return sow ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sow = await loadSow(id);
  if (!sow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("VIEWER", sow.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(sow);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sow = await loadSow(id);
  if (!sow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("SUPER_USER", sow.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of editableFields) {
    if (!(key in body)) continue;
    update[key] = key === "fundingAmount"
      ? (body[key] === "" || body[key] == null ? null : Number(body[key]))
      : (body[key] === "" ? null : body[key]);
  }
  // Signing a contract is a real moment worth recording, not just another field edit.
  if (body.status === "SIGNED" && sow.status !== "SIGNED") {
    update.signedAt = new Date();
    update.signedBy = body.signedBy || user.name;
  }

  const [updated] = await db.update(sows).set(update).where(eq(sows.id, id)).returning();

  await logAudit({
    actor: user, action: "sow.updated", entityType: "sow", entityId: id,
    detail: `${user.name} updated SOW "${updated.title}"${body.status ? ` (status: ${updated.status})` : ""}.`,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sow = await loadSow(id);
  if (!sow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("SUPER_USER", sow.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(sows).where(eq(sows.id, id));
  await logAudit({
    actor: user, action: "sow.deleted", entityType: "sow", entityId: id,
    detail: `${user.name} deleted SOW "${sow.title}" with ${sow.vendorName}.`,
  });
  return NextResponse.json({ ok: true });
}
