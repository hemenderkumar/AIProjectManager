import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scPayments, scMilestones, scAgreementParties } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScAgreement, getScMemberships, hasPlatformRole, isMfaSatisfied } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

const DIRECTIONS = ["CLIENT_TO_PLATFORM", "PLATFORM_TO_VENDOR", "CLIENT_TO_VENDOR", "PLATFORM_COMMISSION"] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ milestoneId: string }> }) {
  const { milestoneId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [milestone] = await db.select().from(scMilestones).where(eq(scMilestones.id, milestoneId));
  if (!milestone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessScAgreement(user, milestone.scAgreementId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await db.select().from(scPayments).where(eq(scPayments.scMilestoneId, milestoneId)));
}

// Who can *initiate* a payment record depends on its direction: a Client-side payment
// (funding the milestone, either straight to a Vendor in MARKETPLACE or via the Platform in
// MEDIATOR) is raised by that Client org's Finance Approver/Org Admin; the Platform's own
// legs (paying out to the Vendor, taking its commission) are raised by Platform Admin only,
// since Keel itself controls that money movement. Every payment starts PENDING regardless of
// who created it -- moving it to HELD/RELEASED/REFUNDED is a separate, Platform-Admin-only
// step (see payments/[paymentId] PATCH), so no one can self-mark their own money as released.
export async function POST(req: NextRequest, { params }: { params: Promise<{ milestoneId: string }> }) {
  const { milestoneId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [milestone] = await db.select().from(scMilestones).where(eq(scMilestones.id, milestoneId));
  if (!milestone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (milestone.status !== "APPROVED") {
    return NextResponse.json({ error: "Milestone must be APPROVED before a payment can be raised against it" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  if (!DIRECTIONS.includes(body.direction)) {
    return NextResponse.json({ error: `direction must be one of: ${DIRECTIONS.join(", ")}` }, { status: 400 });
  }

  const memberships = await getScMemberships(user.id);
  const isPlatform = hasPlatformRole(memberships);
  const parties = await db.select().from(scAgreementParties).where(eq(scAgreementParties.scAgreementId, milestone.scAgreementId));
  const clientOrgId = parties.find((p) => p.partyRole === "CLIENT")?.scOrganizationId;

  const isClientDirection = body.direction === "CLIENT_TO_PLATFORM" || body.direction === "CLIENT_TO_VENDOR";
  if (isClientDirection) {
    const isClientFinance = memberships.some(
      (m) => m.scOrganizationId === clientOrgId && (m.role === "CLIENT_FINANCE_APPROVER" || m.role === "CLIENT_ORG_ADMIN")
    );
    if (!isClientFinance && !isPlatform) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!isPlatform && !(await isMfaSatisfied(user.id, ["CLIENT_FINANCE_APPROVER", "CLIENT_ORG_ADMIN"]))) {
      return NextResponse.json({ error: "MFA must be enabled to raise a payment" }, { status: 403 });
    }
  } else if (!isPlatform) {
    return NextResponse.json({ error: "Only Platform Admin can raise a platform-side payment leg" }, { status: 403 });
  }
  if (isPlatform && !(await isMfaSatisfied(user.id, ["PLATFORM_ADMIN"]))) {
    return NextResponse.json({ error: "MFA must be enabled to raise a payment" }, { status: 403 });
  }

  const amount = Number(body.amount ?? milestone.amount);
  if (!amount || Number.isNaN(amount)) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const [payment] = await db
    .insert(scPayments)
    .values({
      scMilestoneId: milestoneId,
      amount,
      currency: body.currency || milestone.currency,
      fxRateApplied: typeof body.fxRateApplied === "number" ? body.fxRateApplied : null,
      direction: body.direction,
      status: "PENDING",
    })
    .returning();

  await logAudit({
    actor: user,
    action: "keelconnect.payment.created",
    entityType: "sc_payment",
    entityId: payment.id,
    scOrganizationId: clientOrgId ?? null,
    afterValue: JSON.stringify(payment),
  });

  return NextResponse.json(payment, { status: 201 });
}
