import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateCards } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { requireRateCardAccess } from "@/lib/tenancy";

// ?organizationId=<id> lets an ADMIN view/manage one specific company's rates (used by the
// Admin > Organizations drill-down); pass organizationId=none to explicitly mean "global
// defaults." Omitted entirely means ADMIN sees everything, SUPER_USER/internal staff are
// auto-scoped to their own company / the global list regardless of this param.
function parseRequestedOrgId(req: NextRequest): string | null | undefined {
  const raw = req.nextUrl.searchParams.get("organizationId");
  if (raw === null) return undefined;
  return raw === "none" ? null : raw;
}

export async function GET(req: NextRequest) {
  const access = await requireRateCardAccess("VIEWER", parseRequestedOrgId(req));
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows =
    access.scope.kind === "ALL"
      ? await db.select().from(rateCards)
      : access.scope.organizationId === null
        ? await db.select().from(rateCards).where(isNull(rateCards.organizationId))
        : await db.select().from(rateCards).where(eq(rateCards.organizationId, access.scope.organizationId));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const access = await requireRateCardAccess("CONTRIBUTOR", parseRequestedOrgId(req));
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!body.role || !String(body.role).trim()) {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }

  // A new row always lands in the caller's own scope — an ADMIN with no specific company
  // selected (scope "ALL") creates a global default row, same as internal staff.
  const organizationId = access.scope.kind === "ORG" ? access.scope.organizationId : null;

  try {
    const [created] = await db
      .insert(rateCards)
      .values({
        organizationId,
        role: body.role,
        sourcingType: body.sourcingType || "ONSITE",
        hourlyRate: body.hourlyRate === "" || body.hourlyRate == null || Number.isNaN(Number(body.hourlyRate)) ? 0 : Number(body.hourlyRate),
        notes: body.notes || null,
      })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "A rate card for this role + sourcing type already exists — edit it instead." },
      { status: 409 }
    );
  }
}
