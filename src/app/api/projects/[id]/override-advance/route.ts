import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";
import { SUB_STAGE_ORDER, SUB_STAGE_LABELS, STAGE_FOR_SUB_STAGE, subStageIndex } from "@/lib/ideationGates";

// Escape hatch for every hard gate in the Plan sequence (unanimous idea-reviewer approval,
// feasibility/architecture review, resourcing decision) — a project can otherwise get
// permanently stuck if a reviewer never responds, an approver is unavailable, etc. Restricted
// to SUPER_USER (company owner) or ADMIN specifically because it bypasses a control, not just
// edits a field — every use is audit-logged with who did it, what step was skipped, and why.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("SUPER_USER", id);
  if (!user) return NextResponse.json({ error: "Only a company owner or administrator can override a gate." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reason: string | null = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currentIndex = subStageIndex(project.ideationSubStage);
  if (currentIndex === -1 || currentIndex >= SUB_STAGE_ORDER.length - 1) {
    return NextResponse.json({ error: "This project has no further gate to override — it's already past the Plan sequence." }, { status: 409 });
  }

  const from = project.ideationSubStage;
  const to = SUB_STAGE_ORDER[currentIndex + 1];
  const now = new Date();

  const update: Record<string, unknown> = {
    ideationSubStage: to,
    stage: STAGE_FOR_SUB_STAGE[to],
    updatedAt: now,
  };
  // Stamp whichever approval field that gate normally sets, so the rest of the app (which
  // reads e.g. architectureApprovedAt or charterApprovedAt to know a step happened) sees a
  // consistent, honest record that this was an override rather than a real approval.
  if (from === "IDEA_ALIGNMENT") update.ideaConfirmedAt = now;
  if (from === "TECHNICAL_FEASIBILITY" && !project.technicalReviewStatus) update.technicalReviewStatus = "APPROVED";
  if (from === "ARCHITECTURE_REVIEW" && !project.architectureApprovedAt) {
    update.architectureApprovedAt = now;
    update.architectureApprovedBy = `${user.name} (override)`;
  }
  if (to === "READY_FOR_EXECUTION") {
    update.stageApprovedBy = `${user.name} (override)`;
    update.stageApprovedAt = now;
  }

  const [updated] = await db.update(projects).set(update).where(eq(projects.id, id)).returning();

  await logAudit({
    actor: user, action: "project.gate_overridden", entityType: "project", entityId: id,
    organizationId: updated.organizationId,
    detail: `${user.name} overrode the "${SUB_STAGE_LABELS[from]}" gate on "${updated.name}" without waiting for pending approvals, advancing it to "${SUB_STAGE_LABELS[to]}".${reason ? ` Reason: ${reason}` : ""}`,
  });

  return NextResponse.json(updated);
}
