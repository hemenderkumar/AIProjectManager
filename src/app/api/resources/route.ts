import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { requireInternal } from "@/lib/tenancy";

export async function GET() {
  const _authUser = await requireInternal("VIEWER");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await db.select().from(resources);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const _authUser = await requireInternal("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(resources)
    .values({
      name: body.name,
      role: body.role ?? null,
      email: body.email ?? null,
      capacityHoursPerWk: body.capacityHoursPerWk ?? 40,
      costPerHour: body.costPerHour ?? 0,
      skills: Array.isArray(body.skills) ? body.skills : null,
      experienceYears: body.experienceYears ?? null,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
