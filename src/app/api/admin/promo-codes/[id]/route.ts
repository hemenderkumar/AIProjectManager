import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { setPromoCodeActive, listPromoRedemptions } from "@/lib/promo";

// Only activation state is ever mutated after creation -- percent/scope/target are fixed at
// creation time (changing a percentage after a code is already circulating on social media
// would be confusing and, worse, retroactively wrong for anyone who already saw the original
// number). Also returns the redemption trail for this code, for the admin table's expand row.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  if (typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive (boolean) is required" }, { status: 400 });
  }

  try {
    const updated = await setPromoCodeActive(id, body.isActive);
    await logAudit({
      actor: admin,
      action: body.isActive ? "promo_code.reactivated" : "promo_code.deactivated",
      entityType: "promo_code",
      entityId: id,
      organizationId: updated.targetOrganizationId,
      detail: `${admin.name} ${body.isActive ? "reactivated" : "deactivated"} promo code "${updated.code}".`,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not update promo code" }, { status: 400 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const redemptions = await listPromoRedemptions(id);
  return NextResponse.json(redemptions);
}
