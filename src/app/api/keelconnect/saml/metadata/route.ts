import { NextRequest, NextResponse } from "next/server";
import { buildServiceProvider } from "@/lib/keelconnect/saml";

// Public by design -- an enterprise IdP admin needs to fetch this XML document to configure
// their side of the trust relationship (entityID, ACS URL, NameID format), same as any other
// SAML SP metadata endpoint. No KeelConnect data is exposed here, only our own SP config.
export async function GET(req: NextRequest) {
  const sp = buildServiceProvider(req.url);
  return new NextResponse(sp.getMetadata(), {
    headers: { "Content-Type": "application/xml" },
  });
}
