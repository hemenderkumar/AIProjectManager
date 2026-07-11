import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stakeholders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Read: any org member (needed so a PM/Contributor creating a project can pick a sponsor
// from the directory). Write: SUPER_USER only — the company owner curates who counts as
// a valid sponsor, per their explicit request.
export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(stakeholders).where(eq(stakeholders.organizationId, user.organizationId));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(stakeholders)
    .values({
      organizationId: user.organizationId,
      name: body.name.trim(),
      title: body.title || null,
      email: body.email || null,
      divisionId: body.divisionId || null,
    })
    .returning();

  await logAudit({
    actor: user, action: "stakeholder.created", entityType: "stakeholder", entityId: created.id,
    organizationId: user.organizationId, detail: `${user.name} added stakeholder "${created.name}".`,
  });

  return NextResponse.json(created, { status: 201 });
}
