import { NextRequest, NextResponse } from "next/server";
import { getPublicBrandingBySlug } from "@/lib/branding";

// Public (pre-login) branding for /login?org=<slug>. Returns display fields only -- never ids,
// emails, billing or any other org data.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getPublicBrandingBySlug(slug);
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(b, { headers: { "Cache-Control": "public, max-age=60" } });
}
