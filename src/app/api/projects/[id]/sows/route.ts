import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sows, milestones } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

// Any project member can see the SOWs (they're bound by whatever's in them), but only the
// company owner (SUPER_USER) or a Keel admin can create one — same reasoning as the existing
// "only a Keel administrator can create another account owner" restriction: an SOW is a
// contractual document, not a working artifact any teammate should be issuing.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(sows).where(eq(sows.projectId, id)).orderBy(desc(sows.createdAt));
  return NextResponse.json(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("SUPER_USER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.title?.trim() || !body.vendorName?.trim()) {
    return NextResponse.json({ error: "title and vendorName are required" }, { status: 400 });
  }

  const [created] = await db
    .insert(sows)
    .values({
      projectId: id,
      rfpVendorId: body.rfpVendorId || null,
      title: body.title.trim(),
      vendorName: body.vendorName.trim(),
      vendorContactName: body.vendorContactName || null,
      vendorContactEmail: body.vendorContactEmail || null,
      executiveSummary: body.executiveSummary || null,
      scope: body.scope || null,
      deliverablesSummary: body.deliverablesSummary || null,
      timeline: body.timeline || null,
      fundingAmount: body.fundingAmount === "" || body.fundingAmount == null ? null : Number(body.fundingAmount),
      fundingTerms: body.fundingTerms || null,
      risks: body.risks || null,
      issues: body.issues || null,
      content: body.content || null,
      createdByAi: !!body.createdByAi,
      createdBy: user.name,
    })
    .returning();

  // Optional AI-suggested (or owner-typed) milestone list — lands in the same milestones
  // table the project's own Milestones tab reads, tagged with this SOW's id.
  if (Array.isArray(body.milestones) && body.milestones.length > 0) {
    await db.insert(milestones).values(
      body.milestones
        .filter((m: { name?: string }) => m?.name?.trim())
        .map((m: { name: string; dueDate?: string }) => ({
          projectId: id,
          sowId: created.id,
          name: m.name.trim(),
          dueDate: m.dueDate ? new Date(m.dueDate) : null,
        }))
    );
  }

  await logAudit({
    actor: user, action: "sow.created", entityType: "sow", entityId: created.id,
    detail: `${user.name} created SOW "${created.title}" with ${created.vendorName}.`,
  });

  return NextResponse.json(created, { status: 201 });
}
