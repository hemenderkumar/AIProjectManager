import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { escalations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

// Turns "Escalations" from a free-text heading the AI infers inside the steering committee
// report into a real, trackable item -- see escalations in schema.ts and
// generateSteeringCommitteeReport in reportGenerator.ts.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db
    .select()
    .from(escalations)
    .where(eq(escalations.projectId, id))
    .orderBy(desc(escalations.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireProjectAccess("CONTRIBUTOR", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const [created] = await db
    .insert(escalations)
    .values({
      projectId: id,
      title: body.title,
      description: body.description ?? null,
      severity: body.severity ?? "HIGH",
      owner: body.owner ?? null,
      raisedBy: user.name,
      linkedRiskId: body.linkedRiskId ?? null,
    })
    .returning();

  await logAudit({
    actor: user,
    action: "escalation.raised",
    entityType: "escalation",
    entityId: created.id,
    detail: `Raised escalation "${created.title}"`,
  });

  return NextResponse.json(created, { status: 201 });
}
