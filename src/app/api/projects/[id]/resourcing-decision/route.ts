import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, rfps } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { STAGE_FOR_SUB_STAGE } from "@/lib/ideationGates";
import { logAudit } from "@/lib/audit";

// The last Plan gate, right after Charter is approved: build with the company's own people,
// or hire a vendor. INTERNAL just unlocks execution as-is -- staffing happens the same way
// it always has, via Resources/role-mix. VENDOR does the same, but also auto-creates a draft
// RFP seeded from the charter, since "initiate the RFP" was the explicit ask -- the PM still
// reviews/refines it (including AI-drafting the narrative) from Vendor Evaluation before
// publishing. This is also what moves the project into Execution -- it folds in what used to
// be the separate "Approve & Move to Execution" button, since there's no more gate after it.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("PM", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const deliveryMode = body?.deliveryMode === "INTERNAL" || body?.deliveryMode === "VENDOR" ? body.deliveryMode : null;
  if (!deliveryMode) return NextResponse.json({ error: "deliveryMode must be INTERNAL or VENDOR" }, { status: 400 });

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.ideationSubStage !== "RESOURCING_DECISION") {
    return NextResponse.json(
      { error: "This project isn't at the Resourcing Decision step yet — Charter must be approved first." },
      { status: 409 }
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(projects)
    .set({
      deliveryMode,
      deliveryModeDecidedBy: user.name,
      deliveryModeDecidedAt: now,
      ideationSubStage: "READY_FOR_EXECUTION",
      stage: STAGE_FOR_SUB_STAGE.READY_FOR_EXECUTION,
      stageApprovedBy: user.name,
      stageApprovedAt: now,
    })
    .where(eq(projects.id, id))
    .returning();

  await logAudit({
    actor: user, action: "resourcing.decided", entityType: "project", entityId: id,
    organizationId: updated.organizationId,
    detail: `${user.name} decided to resource "${updated.name}" ${deliveryMode === "INTERNAL" ? "with internal resources" : "via vendor RFP"} — project moved to Execution.`,
  });

  let createdRfp: typeof rfps.$inferSelect | null = null;
  if (deliveryMode === "VENDOR" && updated.organizationId) {
    // An RFP row requires an organizationId (it's client-company-scoped) -- an internal-only
    // project (no client company) has nowhere for a vendor RFP to live, so this is skipped
    // for those; the PM can still create one manually as a standalone RFP if needed.
    [createdRfp] = await db
      .insert(rfps)
      .values({
        organizationId: updated.organizationId,
        projectId: updated.id,
        title: `${updated.name} — RFP`,
        background: updated.businessCase ?? updated.problemStatement ?? null,
        scope: updated.scopeInScope ?? null,
        requirements: updated.highLevelRequirements ?? updated.deliverables ?? null,
        timeline: updated.targetEndDate ? `Target completion: ${updated.targetEndDate.toISOString().slice(0, 10)}` : null,
        budgetRange: updated.totalFundingRequired ? `Up to $${updated.totalFundingRequired.toLocaleString()}` : null,
        createdBy: user.name,
      })
      .returning();

    await logAudit({
      actor: user, action: "rfp.created", entityType: "rfp", entityId: createdRfp.id,
      organizationId: updated.organizationId, detail: `${user.name} auto-created a draft RFP from "${updated.name}"'s charter — review and refine it in Vendor Evaluation.`,
    });
  }

  return NextResponse.json({ project: updated, rfp: createdRfp });
}
