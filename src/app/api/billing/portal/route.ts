import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createPortalSession } from "@/lib/billing";

// Opens Stripe's hosted Customer Portal -- update card, view invoices, cancel. Only works
// once the org has actually checked out at least once (has a stripeCustomerId).
export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const session = await createPortalSession(user.organizationId, new URL("/billing", req.nextUrl.origin).toString());
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not open billing portal" }, { status: 400 });
  }
}
