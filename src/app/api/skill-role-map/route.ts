import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skillRoleMap } from "@/lib/db/schema";
import { requireInternal } from "@/lib/tenancy";

// Internal-only, same gate as Rate Cards and the Resources roster -- this is company-wide
// taxonomy data (which role a skill maps to for pricing purposes), not something a
// client-company user has any reason to see or edit.
export async function GET() {
  const user = await requireInternal("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db.select().from(skillRoleMap).orderBy(skillRoleMap.skill);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await requireInternal("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const skill = String(body.skill ?? "").trim().toLowerCase();
  const role = String(body.role ?? "").trim();
  if (!skill || !role) {
    return NextResponse.json({ error: "skill and role are both required" }, { status: 400 });
  }

  try {
    const [created] = await db.insert(skillRoleMap).values({ skill, role }).returning();
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "This skill already has a role mapping — edit it instead." }, { status: 409 });
  }
}
