import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { divisions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Any org member can read the division list (it's just directory info used to label
// teammates/sponsors), but only the company owner (SUPER_USER) can add or remove one —
// this is org structure, not something a PM should be able to redefine.
export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(divisions).where(eq(divisions.organizationId, user.organizationId));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let created;
  try {
    [created] = await db
      .insert(divisions)
      .values({ organizationId: user.organizationId, name: body.name.trim() })
      .returning();
  } catch {
    return NextResponse.json({ error: "A division with that name already exists." }, { status: 409 });
  }

  await logAudit({
    actor: user, action: "division.created", entityType: "division", entityId: created.id,
    organizationId: user.organizationId, detail: `${user.name} added division "${created.name}".`,
  });

  return NextResponse.json(created, { status: 201 });
}
