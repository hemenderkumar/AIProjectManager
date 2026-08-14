import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

// Self-service: a SUPER_USER's own organization record (name + any pending deletion
// request). Not for browsing other organizations — that's the ADMIN-only
// /api/admin/organizations route.
export async function GET() {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [org] = await db.select().from(organizations).where(eq(organizations.id, user.organizationId));
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(org);
}

// Max size for an inline base64 logo -- stored directly on the row (same convention as
// scDeliverables.signedDocumentData) rather than provisioning blob storage for one small
// image. ~300KB of raw image data comes out to ~400KB as base64; keeps the row and every
// page load that renders the sidebar/header logo reasonably light.
const MAX_LOGO_BYTES = 300_000;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export async function PATCH(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const updates: Partial<typeof organizations.$inferInsert> = {};

  if ("brandColor" in body) {
    const brandColor = body.brandColor;
    if (brandColor === null || brandColor === "") {
      updates.brandColor = null;
    } else if (typeof brandColor === "string" && HEX_COLOR_RE.test(brandColor)) {
      updates.brandColor = brandColor;
    } else {
      return NextResponse.json({ error: "brandColor must be a #rrggbb hex value" }, { status: 400 });
    }
  }

  if ("logoDataUrl" in body) {
    const logoDataUrl = body.logoDataUrl;
    if (logoDataUrl === null || logoDataUrl === "") {
      updates.logoDataUrl = null;
    } else if (
      typeof logoDataUrl === "string" &&
      /^data:image\/(png|jpeg|jpg|svg\+xml|webp);base64,/.test(logoDataUrl)
    ) {
      if (logoDataUrl.length > MAX_LOGO_BYTES) {
        return NextResponse.json({ error: "Logo image is too large (max ~300KB)" }, { status: 400 });
      }
      updates.logoDataUrl = logoDataUrl;
    } else {
      return NextResponse.json({ error: "logoDataUrl must be a base64 png/jpeg/svg/webp data URI" }, { status: 400 });
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await db.update(organizations).set(updates).where(eq(organizations.id, user.organizationId));
  const [org] = await db.select().from(organizations).where(eq(organizations.id, user.organizationId));
  return NextResponse.json(org);
}
