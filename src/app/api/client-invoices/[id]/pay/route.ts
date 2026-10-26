import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientInvoices, organizations, projects } from "@/lib/db/schema";
import { requireProjectAccess } from "@/lib/tenancy";
import { getStripe } from "@/lib/billing";
import { appUrl } from "@/lib/stripeConnect";
import { canClientDecide } from "@/lib/deliverableReview";
import { computeApplicationFee } from "@/lib/clientInvoices";
import { roleAtLeast } from "@/lib/auth";

// Creates a Stripe Checkout session as a DIRECT CHARGE on the company's connected account, so the
// money (card or ACH) settles to them, not through Executa. Returns the hosted checkout URL.
// Who can pay: client-side reviewers (CONTRIBUTOR+ inside a client org) or any PM+ on the project.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [inv] = await db.select().from(clientInvoices).where(eq(clientInvoices.id, id));
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("VIEWER", inv.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canClientDecide(user) && !roleAtLeast(user.role, "PM")) {
    return NextResponse.json({ error: "Your role can view invoices but not pay them" }, { status: 403 });
  }
  if (inv.status !== "SENT") {
    return NextResponse.json({ error: inv.status === "PAID" ? "This invoice is already paid" : "This invoice isn't payable" }, { status: 409 });
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, inv.organizationId));
  if (!org?.stripeConnectAccountId || !org.stripeConnectReady) {
    return NextResponse.json({ error: "Online payment isn't available for this invoice yet" }, { status: 409 });
  }
  const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, inv.projectId));

  const base = appUrl(req.nextUrl.origin);
  const fee = computeApplicationFee(inv.amountCents, Number(process.env.STRIPE_CONNECT_FEE_BPS ?? 0));
  const metadata = { clientInvoiceId: inv.id, organizationId: inv.organizationId };

  try {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card", "us_bank_account"],
        customer_email: user.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: inv.currency,
              unit_amount: inv.amountCents,
              product_data: {
                name: `Invoice ${inv.number}`,
                description: [proj?.name, inv.description].filter(Boolean).join(" — ").slice(0, 300) || undefined,
              },
            },
          },
        ],
        metadata,
        payment_intent_data: {
          metadata,
          ...(fee > 0 ? { application_fee_amount: fee } : {}),
        },
        success_url: `${base}/portal?paid=${inv.id}`,
        cancel_url: `${base}/portal?canceled=${inv.id}`,
      },
      { stripeAccount: org.stripeConnectAccountId },
    );
    await db.update(clientInvoices).set({ stripeCheckoutSessionId: session.id }).where(eq(clientInvoices.id, id));
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not start payment" }, { status: 502 });
  }
}
