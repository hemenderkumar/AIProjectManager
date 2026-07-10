import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryRoleMix } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db.select().from(deliveryRoleMix).where(eq(deliveryRoleMix.projectId, id));
  return NextResponse.json(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  if (!body.role || !String(body.role).trim()) {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(deliveryRoleMix)
    .values({
      projectId: id,
      role: body.role,
      hours: Number(body.hours) || 0,
      onsitePercent: body.onsitePercent === undefined ? 100 : Number(body.onsitePercent) || 0,
      offshorePercent: Number(body.offshorePercent) || 0,
      contractorPercent: Number(body.contractorPercent) || 0,
      rationale: body.rationale || null,
      createdByAi: false,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
