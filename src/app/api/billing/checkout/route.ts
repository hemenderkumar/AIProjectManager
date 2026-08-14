import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createCheckoutSession } from "@/lib/billing";

// SUPER_USER (account owner tier) or above can start a subscription for their own org.
// ADMIN (internal staff, organizationId null) has no org to subscribe -- billing doesn't
// apply to Executa's own team.
export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body.planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });

  try {
    const session = await createCheckoutSession({
      organizationId: user.organizationId,
      planId: body.planId,
      successUrl: new URL("/billing?checkout=success", req.nextUrl.origin).toString(),
      cancelUrl: new URL("/billing?checkout=canceled", req.nextUrl.origin).toString(),
      customerEmail: user.email,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not start checkout" }, { status: 400 });
  }
}
