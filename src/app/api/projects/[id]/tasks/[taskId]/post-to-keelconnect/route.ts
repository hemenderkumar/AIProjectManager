import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, scProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { requireScOrgRole } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

// The Keel Deliver <-> KeelConnect bridge: turns a task the AI PM (or a person) already
// classified as executionSource "VENDOR" into a real, postable KeelConnect marketplace
// project, instead of that classification being just a badge with nothing behind it.
// Created as DRAFT (same as posting from KeelConnect directly) so the Client org reviews
// and explicitly posts it to the marketplace themselves, rather than this route silently
// making internal task details visible to Vendors.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await params;

  // Deliver-side check first: only someone with access to the Keel Deliver project this
  // task belongs to can even attempt this.
  const deliverUser = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!deliverUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task || task.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (task.executionSource !== "VENDOR") {
    return NextResponse.json({ error: "Only tasks classified as VENDOR can be posted to KeelConnect" }, { status: 400 });
  }
  if (task.scProjectId) {
    return NextResponse.json({ error: "This task has already been posted to KeelConnect" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const clientOrgId = String(body.clientOrgId || "");
  if (!clientOrgId) return NextResponse.json({ error: "clientOrgId is required" }, { status: 400 });
  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // KeelConnect-side check: posting as a Client org requires actually holding a Client
  // role in that org (or being Platform Admin, per requireScOrgRole's own override).
  const scCtx = await requireScOrgRole(clientOrgId, ["CLIENT_ORG_ADMIN", "CLIENT_REQUESTER"]);
  if (!scCtx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [project] = await db
    .insert(scProjects)
    .values({
      clientOrgId,
      postedByUserId: scCtx.user.id,
      title: String(body.title).trim(),
      description: body.description || null,
      category: body.category || null,
      targetBudget: typeof body.targetBudget === "number" ? body.targetBudget : null,
      currency: body.currency || "USD",
      engagementModel: body.engagementModel === "MEDIATOR" ? "MEDIATOR" : "MARKETPLACE",
      locationRequirement: body.locationRequirement === "RESTRICTED" ? "RESTRICTED" : "GLOBAL",
      restrictedCountries: Array.isArray(body.restrictedCountries) ? body.restrictedCountries : null,
      status: "DRAFT",
    })
    .returning();

  await db.update(tasks).set({ scProjectId: project.id, updatedAt: new Date() }).where(eq(tasks.id, taskId));

  await logAudit({
    actor: scCtx.user,
    action: "keelconnect.project.created_from_task",
    entityType: "sc_project",
    entityId: project.id,
    scOrganizationId: clientOrgId,
    afterValue: JSON.stringify({ ...project, sourceTaskId: taskId, sourceProjectId: projectId }),
  });

  return NextResponse.json(project, { status: 201 });
}
