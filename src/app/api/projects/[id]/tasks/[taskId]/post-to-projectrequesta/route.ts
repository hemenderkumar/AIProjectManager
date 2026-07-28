import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

// The Executa <-> ProjectRequesta bridge: turns a task the AI PM (or a person) already
// classified as executionSource "VENDOR" into a real, postable ProjectRequesta marketplace
// project. ProjectRequesta is now a fully separate app with its own database and its own
// login -- there is no shared `pr_projects` table to insert into anymore, so this makes an
// authenticated HTTP call to that app's own /api/bridge/post-project endpoint instead (see
// PROJECTREQUESTA_BRIDGE_URL below). Executa is trusted to have already verified, on its own
// side, that the requesting user has rights to post under the given Deliver project (the
// requireProjectAccess check below) -- the receiving endpoint independently checks that
// clientOrgId refers to a real CLIENT organization on its end, but has no way to check
// whether *this* Executa user is a member of it, since the two apps no longer share an
// account system. `clientOrgId` is therefore whatever ProjectRequesta org id the user
// supplies directly (see PostToProjectRequestaModal.tsx), not looked up from a shared table.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await params;

  const deliverUser = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!deliverUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task || task.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (task.executionSource !== "VENDOR") {
    return NextResponse.json({ error: "Only tasks classified as VENDOR can be posted to ProjectRequesta" }, { status: 400 });
  }
  if (task.postedToMarketplaceAt) {
    return NextResponse.json({ error: "This task has already been posted to ProjectRequesta" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const clientOrgId = String(body.clientOrgId || "");
  if (!clientOrgId) return NextResponse.json({ error: "clientOrgId is required" }, { status: 400 });
  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const bridgeUrl = process.env.PROJECTREQUESTA_BRIDGE_URL;
  const bridgeKey = process.env.BRIDGE_API_KEY;
  if (!bridgeUrl || !bridgeKey) {
    return NextResponse.json({ error: "The ProjectRequesta bridge is not configured on this deployment" }, { status: 503 });
  }

  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId));

  let bridgeRes: Response;
  try {
    bridgeRes = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bridgeKey}` },
      body: JSON.stringify({
        clientOrgId,
        title: String(body.title).trim(),
        description: body.description || null,
        category: body.category || null,
        targetBudget: typeof body.targetBudget === "number" ? body.targetBudget : null,
        currency: body.currency || "USD",
        engagementModel: body.engagementModel === "MEDIATOR" ? "MEDIATOR" : "MARKETPLACE",
        locationRequirement: body.locationRequirement === "RESTRICTED" ? "RESTRICTED" : "GLOBAL",
        restrictedCountries: Array.isArray(body.restrictedCountries) ? body.restrictedCountries : null,
        sourceDeliverTaskId: taskId,
        sourceDeliverProjectId: projectId,
        sourceDeliverProjectName: project?.name ?? null,
        sourceDeliverTaskTitle: task.title,
        postedByName: deliverUser.name,
        postedByEmail: deliverUser.email,
      }),
    });
  } catch {
    return NextResponse.json({ error: "Could not reach ProjectRequesta -- try again shortly" }, { status: 502 });
  }

  const posted = await bridgeRes.json().catch(() => null);
  if (!bridgeRes.ok || !posted?.id) {
    return NextResponse.json({ error: posted?.error ?? "ProjectRequesta rejected this posting" }, { status: bridgeRes.status || 502 });
  }

  await db
    .update(tasks)
    .set({ postedToMarketplaceProjectId: posted.id, postedToMarketplaceAt: new Date(), updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  await logAudit({
    actor: deliverUser,
    action: "projectrequesta.project.created_from_task",
    entityType: "task",
    entityId: taskId,
    afterValue: JSON.stringify({ postedToMarketplaceProjectId: posted.id, clientOrgId, sourceTaskId: taskId, sourceProjectId: projectId }),
  });

  return NextResponse.json(posted, { status: 201 });
}
