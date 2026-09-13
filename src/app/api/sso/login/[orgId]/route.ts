import { NextRequest, NextResponse } from "next/server";
import { getSsoConfig, buildServiceProvider, buildIdentityProvider } from "@/lib/sso";

// Public, SP-initiated login: builds a SAML AuthnRequest for this organization's configured IdP
// and redirects the browser to the IdP's SSO endpoint (HTTP-Redirect binding). Reached either
// directly (an org can bookmark/link this) or via /api/sso/discover from the login page's
// "Sign in with SSO" flow.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const config = await getSsoConfig(orgId);
  if (!config || !config.isEnabled) {
    return NextResponse.redirect(new URL("/login?error=sso_not_configured", _req.url));
  }

  const sp = buildServiceProvider(orgId);
  const idp = buildIdentityProvider(config);
  const { context } = sp.createLoginRequest(idp, "redirect");
  return NextResponse.redirect(context);
}
