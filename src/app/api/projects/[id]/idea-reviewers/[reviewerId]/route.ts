import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ideaReviewers, projects } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/tenancy";
import { STAGE_FOR_SUB_STAGE } from "@/lib/ideationGates";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reviewerId: string }> }
) {
  const { id, reviewerId } = await params;
  const user = await requireProjectAccess("PM", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(ideaReviewers).where(and(eq(ideaReviewers.id, reviewerId), eq(ideaReviewers.projectId, id)));
  return NextResponse.json({ ok: true });
}

// The invited person responds for themselves — not the PM on their behalf, per the
// unanimous-approval design (see the comment on ideaReviewDecisionEnum in db/schema.ts).
// The moment every invited row on this project reaches APPROVED, this is also what
// advances Idea & Alignment -> Technical Feasibility, stamping ideaConfirmedAt as the
// record of when the group actually aligned.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reviewerId: string }> }
) {
  const { id, reviewerId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [reviewer] = await db
    .select()
    .from(ideaReviewers)
    .where(and(eq(ideaReviewers.id, reviewerId), eq(ideaReviewers.projectId, id)));
  if (!reviewer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (reviewer.userId !== user.id) {
    return NextResponse.json({ error: "Only the invited reviewer can record their own response." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const decision = body?.decision === "APPROVED" || body?.decision === "CHANGES_REQUESTED" ? body.decision : null;
  if (!decision) return NextResponse.json({ error: "decision must be APPROVED or CHANGES_REQUESTED" }, { status: 400 });

  const [updated] = await db
    .update(ideaReviewers)
    .set({ decision, comment: body?.comment ?? null, respondedAt: new Date() })
    .where(eq(ideaReviewers.id, reviewerId))
    .returning();

  await logAudit({
    actor: user, action: "idea_reviewer.responded", entityType: "project", entityId: id,
    detail: `${user.name} ${decision === "APPROVED" ? "approved" : "requested changes to"} this idea.`,
  });

  // Gate check: has everyone invited now approved?
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (project && project.ideationSubStage === "IDEA_ALIGNMENT" && decision === "APPROVED") {
    const [notYetApproved] = await db
      .select({ id: ideaReviewers.id })
      .from(ideaReviewers)
      .where(and(eq(ideaReviewers.projectId, id), ne(ideaReviewers.decision, "APPROVED")));
    if (!notYetApproved) {
      await db
        .update(projects)
        .set({
          ideationSubStage: "TECHNICAL_FEASIBILITY",
          stage: STAGE_FOR_SUB_STAGE.TECHNICAL_FEASIBILITY,
          ideaConfirmedAt: new Date(),
        })
        .where(eq(projects.id, id));
      await logAudit({
        actor: user, action: "idea.confirmed", entityType: "project", entityId: id,
        detail: `Every invited reviewer approved — idea confirmed, advancing to Technical Feasibility.`,
      });
    }
  }

  return NextResponse.json(updated);
}
