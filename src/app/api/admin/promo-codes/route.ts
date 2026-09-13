import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createPromoCode, listPromoCodes, type PromoScope, type PromoDuration } from "@/lib/promo";

// Internal ADMIN only -- generating a discount is a revenue decision, not something a client
// org's own SUPER_USER should be able to do for themselves (unlike Plans, which are also
// ADMIN-only for the same reason -- see /api/admin/plans).
export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const all = await listPromoCodes();
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body.code || !String(body.code).trim()) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }
  if (!["SPECIFIC_ORG", "GROUP", "GENERIC"].includes(body.scope)) {
    return NextResponse.json({ error: "scope must be SPECIFIC_ORG, GROUP, or GENERIC" }, { status: 400 });
  }

  try {
    const created = await createPromoCode({
      code: String(body.code),
      percentOff: Number(body.percentOff),
      scope: body.scope as PromoScope,
      duration: body.duration as PromoDuration | undefined,
      durationInMonths: typeof body.durationInMonths === "number" ? body.durationInMonths : undefined,
      targetOrganizationId: body.targetOrganizationId || undefined,
      groupLabel: body.groupLabel || undefined,
      maxRedemptions: typeof body.maxRedemptions === "number" ? body.maxRedemptions : undefined,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      createdBy: admin,
    });

    await logAudit({
      actor: admin,
      action: "promo_code.created",
      entityType: "promo_code",
      entityId: created.id,
      organizationId: created.targetOrganizationId,
      detail: `${admin.name} created a ${created.percentOff}% off promo code "${created.code}" (${created.scope}).`,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create promo code" }, { status: 400 });
  }
}
