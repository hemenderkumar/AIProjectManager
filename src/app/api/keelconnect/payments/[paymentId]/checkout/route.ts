import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scPayments, scMilestones, scAgreements, scAgreementParties } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScPayment, getScMemberships, hasPlatformRole, isMfaSatisfied } from "@/lib/keelconnect/access";
import { getStripeClient, isStripeConfigured } from "@/lib/keelconnect/stripe";
import { logAudit } from "@/lib/audit";

// Creates a Stripe Checkout Session so the Client can actually pay a PENDING, client-funded
// payment (#259). Funds are captured onto the Platform's own Stripe balance (no
// transfer_data here) -- see the webhook route for how that becomes HELD, and the payments
// PATCH route for how releasing it becomes a real Transfer to the Vendor's connected
// account. Only ever usable for the two client-originated directions; the platform's own
// legs (PLATFORM_TO_VENDOR, PLATFORM_COMMISSION) aren't something a Client pays for.
export async function POST(req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessScPayment(user, paymentId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [payment] = await db.select().from(scPayments).where(eq(scPayments.id, paymentId));
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (payment.status !== "PENDING") return NextResponse.json({ error: `Payment is ${payment.status}, not payable` }, { status: 400 });
  if (payment.direction !== "CLIENT_TO_PLATFORM" && payment.direction !== "CLIENT_TO_VENDOR") {
    return NextResponse.json({ error: "Only a client-funded payment can be paid via Checkout" }, { status: 400 });
  }

  const [milestone] = await db.select().from(scMilestones).where(eq(scMilestones.id, payment.scMilestoneId));
  if (!milestone) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  const [agreement] = await db.select().from(scAgreements).where(eq(scAgreements.id, milestone.scAgreementId));
  const parties = await db.select().from(scAgreementParties).where(eq(scAgreementParties.scAgreementId, milestone.scAgreementId));
  const clientOrgId = parties.find((p) => p.partyRole === "CLIENT")?.scOrganizationId;

  const memberships = await getScMemberships(user.id);
  const isPlatform = hasPlatformRole(memberships);
  const isClientFinance = memberships.some(
    (m) => m.scOrganizationId === clientOrgId && (m.role === "CLIENT_FINANCE_APPROVER" || m.role === "CLIENT_ORG_ADMIN")
  );
  if (!isPlatform && !isClientFinance) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isPlatform && !(await isMfaSatisfied(user.id, ["CLIENT_FINANCE_APPROVER", "CLIENT_ORG_ADMIN"]))) {
    return NextResponse.json({ error: "MFA must be enabled to pay a milestone" }, { status: 403 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured on this deployment yet. Ask a Platform Admin to set STRIPE_SECRET_KEY." }, { status: 501 });
  }

  const stripe = getStripeClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const projectId = agreement?.scProjectId;
  const returnPath = projectId ? `/keelconnect/projects/${projectId}` : "/keelconnect/projects";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: payment.currency.toLowerCase(),
          product_data: { name: `KeelConnect milestone: ${milestone.description}` },
          unit_amount: Math.round(payment.amount * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { scPaymentId: payment.id },
    success_url: `${appUrl}${returnPath}?payment=success`,
    cancel_url: `${appUrl}${returnPath}?payment=cancelled`,
  });

  await db.update(scPayments).set({ stripeCheckoutSessionId: session.id }).where(eq(scPayments.id, paymentId));

  await logAudit({
    actor: user,
    action: "keelconnect.payment.checkout_created",
    entityType: "sc_payment",
    entityId: paymentId,
    scOrganizationId: clientOrgId ?? null,
    afterValue: JSON.stringify({ stripeCheckoutSessionId: session.id }),
  });

  return NextResponse.json({ url: session.url });
}
