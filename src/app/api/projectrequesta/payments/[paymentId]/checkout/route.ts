import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prPayments, prMilestones, prAgreements, prAgreementParties } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPrPayment, getPrMemberships, hasPlatformRole, isMfaSatisfied } from "@/lib/projectrequesta/access";
import { getStripeClient, isStripeConfigured } from "@/lib/projectrequesta/stripe";
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
  if (!(await canAccessPrPayment(user, paymentId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [payment] = await db.select().from(prPayments).where(eq(prPayments.id, paymentId));
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (payment.status !== "PENDING") return NextResponse.json({ error: `Payment is ${payment.status}, not payable` }, { status: 400 });
  if (payment.direction !== "CLIENT_TO_PLATFORM" && payment.direction !== "CLIENT_TO_VENDOR") {
    return NextResponse.json({ error: "Only a client-funded payment can be paid via Checkout" }, { status: 400 });
  }

  const [milestone] = await db.select().from(prMilestones).where(eq(prMilestones.id, payment.prMilestoneId));
  if (!milestone) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  const [agreement] = await db.select().from(prAgreements).where(eq(prAgreements.id, milestone.prAgreementId));
  const parties = await db.select().from(prAgreementParties).where(eq(prAgreementParties.prAgreementId, milestone.prAgreementId));
  const clientOrgId = parties.find((p) => p.partyRole === "CLIENT")?.prOrganizationId;

  const memberships = await getPrMemberships(user.id);
  const isPlatform = hasPlatformRole(memberships);
  const isClientFinance = memberships.some(
    (m) => m.prOrganizationId === clientOrgId && (m.role === "CLIENT_FINANCE_APPROVER" || m.role === "CLIENT_ORG_ADMIN")
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
  const projectId = agreement?.prProjectId;
  const returnPath = projectId ? `/projectrequesta/projects/${projectId}` : "/projectrequesta/projects";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: payment.currency.toLowerCase(),
          product_data: { name: `ProjectRequesta milestone: ${milestone.description}` },
          unit_amount: Math.round(payment.amount * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { prPaymentId: payment.id },
    success_url: `${appUrl}${returnPath}?payment=success`,
    cancel_url: `${appUrl}${returnPath}?payment=cancelled`,
  });

  await db.update(prPayments).set({ stripeCheckoutSessionId: session.id }).where(eq(prPayments.id, paymentId));

  await logAudit({
    actor: user,
    action: "projectrequesta.payment.checkout_created",
    entityType: "pr_payment",
    entityId: paymentId,
    prOrganizationId: clientOrgId ?? null,
    afterValue: JSON.stringify({ stripeCheckoutSessionId: session.id }),
  });

  return NextResponse.json({ url: session.url });
}
