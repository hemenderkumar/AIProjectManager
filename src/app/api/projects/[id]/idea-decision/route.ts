import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";
import { validateIdeaDecision } from "@/lib/ideaEvaluation";

// The idea-stage go / park / stop call. GO marks the idea ready for the Charter; it never
// skips the later gates. Recorded with who/when so the deck's decision is auditable.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireProjectAccess("PM", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const v = validateIdeaDecision(body?.decision, body?.note);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const [existing] = await db.select({ name: projects.name, organizationId: projects.organizationId }).from(projects).where(eq(projects.id, id));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const [updated] = await db
    .update(projects)
    .set({
      ideaDecision: v.decision, ideaDecisionNote: v.note || null, ideaDecidedBy: user.name, ideaDecidedAt: now,
      ...(v.decision === "GO" ? { ideationStatus: "READY_FOR_CHARTER" as const } : {}),
    })
    .where(eq(projects.id, id))
    .returning();

  await logAudit({
    actor: user, action: "idea.decision", entityType: "project", entityId: id, organizationId: existing.organizationId,
    detail: `${user.name} decided ${v.decision} on idea "${existing.name}"${v.note ? `: ${v.note}` : ""}`,
  });
  return NextResponse.json({ ideaDecision: updated.ideaDecision, ideaDecisionNote: updated.ideaDecisionNote, ideaDecidedBy: updated.ideaDecidedBy, ideaDecidedAt: now.toISOString() });
}
