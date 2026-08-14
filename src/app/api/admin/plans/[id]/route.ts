import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [before] = await db.select().from(plans).where(eq(plans.id, id));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if ("name" in body) patch.name = String(body.name).trim();
  if ("description" in body) patch.description = body.description || null;
  if ("stripePriceId" in body) patch.stripePriceId = body.stripePriceId || null;
  if ("priceCents" in body) patch.priceCents = typeof body.priceCents === "number" ? body.priceCents : null;
  if ("billingInterval" in body) patch.billingInterval = body.billingInterval === "year" ? "year" : "month";
  if ("billingModel" in body) patch.billingModel = body.billingModel === "per_seat" ? "per_seat" : "flat";
  if ("projectLimit" in body) patch.projectLimit = typeof body.projectLimit === "number" ? body.projectLimit : null;
  if ("seatLimit" in body) patch.seatLimit = typeof body.seatLimit === "number" ? body.seatLimit : null;
  if ("sortOrder" in body) patch.sortOrder = typeof body.sortOrder === "number" ? body.sortOrder : 0;
  if ("isActive" in body) patch.isActive = !!body.isActive;
  // null = every module enabled (the default, and the only value pre-existing plans have);
  // an array restricts to exactly those MODULE_REGISTRY keys. See lib/modules.ts.
  if ("enabledModules" in body) {
    patch.enabledModules = Array.isArray(body.enabledModules)
      ? body.enabledModules.filter((k: unknown) => typeof k === "string")
      : null;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No recognized fields in body" }, { status: 400 });

  const [updated] = await db.update(plans).set(patch).where(eq(plans.id, id)).returning();

  await logAudit({
    actor: admin, action: "plan.updated", entityType: "plan", entityId: id,
    organizationId: null, detail: `${admin.name} updated plan "${before.name}".`,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [existing] = await db.select({ name: plans.name }).from(plans).where(eq(plans.id, id));
  await db.delete(plans).where(eq(plans.id, id));

  await logAudit({
    actor: admin, action: "plan.deleted", entityType: "plan", entityId: id,
    organizationId: null, detail: `${admin.name} deleted plan "${existing?.name ?? id}".`,
  });

  return NextResponse.json({ ok: true });
}
