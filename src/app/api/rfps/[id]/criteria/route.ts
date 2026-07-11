import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfpCriteria } from "@/lib/db/schema";
import { requireOwnedRfp } from "@/lib/rfp";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnedRfp(id);
  if ("error" in guard) return guard.error;

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const [created] = await db
    .insert(rfpCriteria)
    .values({
      rfpId: id,
      name: body.name.trim(),
      weightPercent: Number.isFinite(Number(body.weightPercent)) ? Number(body.weightPercent) : 0,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
