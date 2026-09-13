import { NextRequest, NextResponse } from "next/server";
import { findEnabledSsoConfigByEmail } from "@/lib/sso";

// Public. Powers the "Sign in with SSO" affordance on the login page: given a work email,
// look up whether its domain has an enabled SSO configuration and, if so, return the URL to
// redirect to. Deliberately returns only a URL, never any IdP configuration details, since
// this endpoint has no auth of its own -- anyone can probe which domains have SSO enabled
// (the same is true of most "Sign in with SSO" flows; it is not sensitive information).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a work email address." }, { status: 400 });
  }

  const config = await findEnabledSsoConfigByEmail(email);
  if (!config) {
    return NextResponse.json({ error: "No SSO configuration found for this email domain." }, { status: 404 });
  }

  return NextResponse.json({ loginUrl: `/api/sso/login/${config.organizationId}` });
}
