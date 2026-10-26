import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientInvoices, organizations, projects, users, projectMembers } from "@/lib/db/schema";
import { requireProjectAccess } from "@/lib/tenancy";
import { canTransition, formatMoney, type ClientInvoiceStatus } from "@/lib/clientInvoices";
import { sendBrandedEmail } from "@/lib/brandedEmail";
import { appUrl } from "@/lib/stripeConnect";
import { logAudit } from "@/lib/audit";

// PATCH { status: "SENT" | "VOID" }: send a draft to the client (requires the company's Stripe
// account to be ready so the "Pay now" button works) or void an unpaid invoice. PAID can never be
// set here -- only the verified Stripe webhook marks an invoice paid.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [inv] = await db.select().from(clientInvoices).where(eq(clientInvoices.id, id));
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("PM", inv.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const to = body.status as ClientInvoiceStatus;
  if (to !== "SENT" && to !== "VOID") return NextResponse.json({ error: "status must be SENT or VOID" }, { status: 400 });
  if (!canTransition(inv.status, to)) {
    return NextResponse.json({ error: `Cannot move an invoice from ${inv.status} to ${to}` }, { status: 409 });
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, inv.organizationId));
  if (to === "SENT" && !org?.stripeConnectReady) {
    return NextResponse.json(
      { error: "Connect your Stripe account (My Organization → Client billing) before sending invoices" },
      { status: 409 },
    );
  }

  // Conditional update guards against a concurrent webhook marking it PAID between read and write.
  const [updated] = await db
    .update(clientInvoices)
    .set({ status: to })
    .where(and(eq(clientInvoices.id, id), eq(clientInvoices.status, inv.status)))
    .returning();
  if (!updated) return NextResponse.json({ error: "Invoice changed — refresh and try again" }, { status: 409 });

  await logAudit({
    actor: user, action: `client_invoice.${to.toLowerCase()}`, entityType: "client_invoice", entityId: id,
    detail: `${user.name} ${to === "SENT" ? "sent" : "voided"} invoice ${inv.number}.`,
  });

  if (to === "SENT") {
    const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, inv.projectId));
    // Email every client-side member of the project (organization users) with portal access.
    const recipients = await db
      .select({ email: users.email, organizationId: users.organizationId })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, inv.projectId));
    const base = appUrl(req.nextUrl.origin);
    await Promise.all(
      recipients
        .filter((r) => r.organizationId === inv.organizationId)
        .map((r) =>
          sendBrandedEmail({
            organizationId: inv.organizationId,
            to: r.email,
            subject: `Invoice ${inv.number} — ${formatMoney(inv.amountCents, inv.currency)}`,
            heading: `Invoice ${inv.number}`,
            paragraphs: [
              `A new invoice for ${proj?.name ?? "your project"} is ready: ${formatMoney(inv.amountCents, inv.currency)}${inv.dueDate ? `, due ${inv.dueDate.toLocaleDateString("en-US")}` : ""}.`,
              inv.description ?? "",
            ].filter(Boolean),
            cta: { label: "View and pay", url: `${base}/portal` },
          }).catch(() => false),
        ),
    );
  }

  return NextResponse.json(updated);
}
