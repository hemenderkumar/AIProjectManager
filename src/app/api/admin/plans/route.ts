import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const all = await db.select().from(plans).orderBy(plans.sortOrder);
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(plans)
    .values({
      name: String(body.name).trim(),
      description: body.description || null,
      stripePriceId: body.stripePriceId || null,
      priceCents: typeof body.priceCents === "number" ? body.priceCents : null,
      billingInterval: body.billingInterval === "year" ? "year" : "month",
      billingModel: body.billingModel === "per_seat" ? "per_seat" : "flat",
      projectLimit: typeof body.projectLimit === "number" ? body.projectLimit : null,
      seatLimit: typeof body.seatLimit === "number" ? body.seatLimit : null,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
    })
    .returning();

  await logAudit({
    actor: admin, action: "plan.created", entityType: "plan", entityId: created.id,
    organizationId: null, detail: `${admin.name} created plan "${created.name}".`,
  });

  return NextResponse.json(created, { status: 201 });
}
