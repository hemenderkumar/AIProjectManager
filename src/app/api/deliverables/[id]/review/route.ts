import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { deliverables, deliverableComments, projects } from "@/lib/db/schema";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";
import { canClientDecide, notifyDeliveryTeam, validateDecision } from "@/lib/deliverableReview";

// Client-portal sign-off: a client reviewer approves a deliverable that is IN_REVIEW, or sends
// it back with a required note. Distinct from the generic PATCH (which is a CONTRIBUTOR-tier
// editing surface for the delivery team) so the client gets exactly two actions and nothing
// else. Every decision is also written to the comment thread as an audit-style DECISION row.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d] = await db.select().from(deliverables).where(eq(deliverables.id, id));
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("VIEWER", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canClientDecide(user)) {
    return NextResponse.json({ error: "Only client reviewers can approve or request changes here" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const v = validateDecision(body.decision, body.note, d.status);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const now = new Date();
  const update: Record<string, unknown> = { status: v.status, updatedAt: now };
  if (v.status === "APPROVED") {
    update.approvedAt = now;
    update.approvedBy = user.name;
  }
  const [updated] = await db.update(deliverables).set(update).where(eq(deliverables.id, id)).returning();

  await db.insert(deliverableComments).values({
    deliverableId: id,
    kind: "DECISION",
    authorUserId: user.id,
    authorName: user.name,
    authorSide: "CLIENT",
    body: v.status === "APPROVED" ? v.note || "Approved" : v.note,
  });

  await logAudit({
    actor: user,
    action: v.status === "APPROVED" ? "deliverable.client_approved" : "deliverable.client_changes_requested",
    entityType: "deliverable",
    entityId: id,
    detail: `${user.name} ${v.status === "APPROVED" ? "approved" : "requested changes on"} "${d.title}" in the client portal.`,
  });

  await notifyDeliveryTeam({
    projectId: d.projectId,
    actor: user,
    title: v.status === "APPROVED" ? `Approved: ${d.title}` : `Changes requested: ${d.title}`,
    body: v.note || `${user.name} approved this deliverable.`,
  });

  if (v.status === "APPROVED") {
    const [proj] = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, d.projectId));
    await dispatchWebhook(proj?.organizationId ?? null, "DELIVERABLE_APPROVED", {
      id: updated.id, title: updated.title, projectId: updated.projectId, approvedBy: updated.approvedBy,
    });
  }

  return NextResponse.json(updated);
}
