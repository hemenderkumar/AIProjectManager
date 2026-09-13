import { NextRequest, NextResponse } from "next/server";
import { buildServiceProvider } from "@/lib/sso";

// Public by design (standard SAML practice) -- an SP's metadata (its entityID and ACS URL) is
// not sensitive, and an organization's IT admin needs to fetch this to paste into their IdP's
// "add application" flow. No secret material is ever included here.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const sp = buildServiceProvider(orgId);
  return new NextResponse(sp.getMetadata(), {
    headers: { "Content-Type": "application/xml" },
  });
}
