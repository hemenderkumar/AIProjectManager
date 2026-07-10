import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateCards } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const _authUser = await requireRole("VIEWER");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db.select().from(rateCards);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.role || !String(body.role).trim()) {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }
  try {
    const [created] = await db
      .insert(rateCards)
      .values({
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
