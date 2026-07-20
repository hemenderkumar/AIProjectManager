import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ideaReviewers, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

// Invites an existing Keel user to weigh in on this idea — the unanimous-approval gate in
// idea-reviewers/[reviewerId]/route.ts won't let Idea & Alignment advance until every row
// created here reaches APPROVED. Gated at PM-and-above rather than just project access, so
// this includes the company owner (SUPER_USER) "pulling in" people for their org's idea, not
// just the assigned PM.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("PM", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? "");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const [invitee] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId));
  if (!invitee) return NextResponse.json({ error: "That user does not exist." }, { status: 400 });

  const [existing] = await db
    .select({ id: ideaReviewers.id })
    .from(ideaReviewers)
    .where(and(eq(ideaReviewers.projectId, id), eq(ideaReviewers.userId, userId)));
  if (existing) return NextResponse.json({ error: "Already invited." }, { status: 409 });

  const [created] = await db
    .insert(ideaReviewers)
    .values({ projectId: id, userId, invitedBy: user.name })
    .returning();

  await logAudit({
    actor: user, action: "idea_reviewer.invited", entityType: "project", entityId: id,
    detail: `${user.name} invited ${invitee.name} to weigh in on this idea.`,
  });

  return NextResponse.json(created, { status: 201 });
}
