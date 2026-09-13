import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hiringRequisitions, resources } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireInternal } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

// Internal-only, same gate as the Resources roster and Skill-to-Role map -- this is Executa's
// own hiring plan, not something a client-company user has any reason to see.
export async function GET() {
  const user = await requireInternal("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db
    .select({
      id: hiringRequisitions.id,
      skill: hiringRequisitions.skill,
      role: hiringRequisitions.role,
      targetHeadcount: hiringRequisitions.targetHeadcount,
      sourcingType: hiringRequisitions.sourcingType,
      status: hiringRequisitions.status,
      targetStartDate: hiringRequisitions.targetStartDate,
      notes: hiringRequisitions.notes,
      createdBy: hiringRequisitions.createdBy,
      createdAt: hiringRequisitions.createdAt,
      filledByResourceId: hiringRequisitions.filledByResourceId,
      filledByResourceName: resources.name,
      filledAt: hiringRequisitions.filledAt,
    })
    .from(hiringRequisitions)
    .leftJoin(resources, eq(hiringRequisitions.filledByResourceId, resources.id))
    .orderBy(desc(hiringRequisitions.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await requireInternal("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const skill = String(body.skill ?? "").trim();
  if (!skill) return NextResponse.json({ error: "skill is required" }, { status: 400 });

  const [created] = await db
    .insert(hiringRequisitions)
    .values({
      skill,
      role: body.role || null,
      targetHeadcount: Number.isFinite(Number(body.targetHeadcount)) && Number(body.targetHeadcount) > 0 ? Number(body.targetHeadcount) : 1,
      sourcingType: body.sourcingType || null,
      targetStartDate: body.targetStartDate ? new Date(body.targetStartDate) : null,
      notes: body.notes || null,
      createdBy: user.name,
    })
    .returning();

  await logAudit({
    actor: user,
    action: "hiring_requisition.created",
    entityType: "hiring_requisition",
    entityId: created.id,
    detail: `${user.name} opened a hiring requisition for ${created.targetHeadcount} ${created.skill}${created.targetHeadcount === 1 ? "" : "s"}.`,
  });

  return NextResponse.json(created, { status: 201 });
}
