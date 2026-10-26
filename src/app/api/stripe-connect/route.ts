import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createOnboardingLink, syncConnectStatus } from "@/lib/stripeConnect";

// GET: current connect status for the caller's organization (re-synced from Stripe).
export async function GET() {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await syncConnectStatus(user.organizationId));
  } catch {
    // Stripe not configured yet -- report as not connected rather than erroring the page.
    return NextResponse.json({ connected: false, ready: false, detailsSubmitted: false, unavailable: true });
  }
}

// POST: start (or resume) Stripe Express onboarding; returns the hosted onboarding URL.
export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const url = await createOnboardingLink(user.organizationId, req.nextUrl.origin);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start Stripe onboarding" },
      { status: 500 },
    );
  }
}
