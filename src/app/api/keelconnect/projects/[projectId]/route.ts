import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scProjects, scAgreements } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScProject, getScMemberships, rolesInOrg, hasPlatformRole } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessScProject(user, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [project] = await db.select().from(scProjects).where(eq(scProjects.id, projectId));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

// Owning client org (Requester/Org Admin) or Platform Admin can edit. Covers both content
// edits (title/description/budget/etc. while still DRAFT) and status transitions -- posting
// DRAFT -> OPEN, CANCELLED at any point before COMPLETED, and once awarded, AWARDED ->
// IN_PROGRESS -> COMPLETED to close out the engagement (see generateAgreementsForAcceptedBid
// for how AWARDED is reached in the first place -- that part happens as a side effect of
// accepting a bid, not through this route).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [before] = await db.select().from(scProjects).where(eq(scProjects.id, projectId));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const memberships = await getScMemberships(user.id);
  const isPlatform = hasPlatformRole(memberships);
  const myClientRoles = rolesInOrg(memberships, before.clientOrgId);
  const isClientOwner = myClientRoles.includes("CLIENT_ORG_ADMIN") || myClientRoles.includes("CLIENT_REQUESTER");
  if (!isPlatform && !isClientOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of [
    "title",
    "description",
    "category",
    "targetBudget",
    "currency",
    "engagementModel",
    "locationRequirement",
    "restrictedCountries",
    // requestType deliberately excluded -- Project vs Resource Request is fixed at creation,
    // not something to flip after the fact.
    "skillsRequired",
    "durationWeeks",
    "rateType",
  ]) {
    if (key in body) patch[key] = body[key];
  }
  if (body.deadline !== undefined) patch.deadline = body.deadline ? new Date(body.deadline) : null;
  if (body.status) {
    const validTransitions: Record<string, string[]> = {
      DRAFT: ["OPEN", "CANCELLED"],
      OPEN: ["NEGOTIATING", "CANCELLED"],
      NEGOTIATING: ["OPEN", "CANCELLED"],
      AWARDED: ["IN_PROGRESS", "CANCELLED"],
      IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    };
    if (!validTransitions[before.status]?.includes(body.status) && !isPlatform) {
      return NextResponse.json({ error: `Cannot move project from ${before.status} to ${body.status}` }, { status: 400 });
    }
    // Work can't officially start until every agreement generated off the winning bid (one
    // for MARKETPLACE, two for MEDIATOR) is ACTIVE -- otherwise a project could read
    // IN_PROGRESS while its contract is still sitting in DRAFT/SENT/SIGNED.
    if (body.status === "IN_PROGRESS" && !isPlatform) {
      const projectAgreements = await db.select().from(scAgreements).where(eq(scAgreements.scProjectId, projectId));
      if (!projectAgreements.length || !projectAgreements.every((a) => a.status === "ACTIVE")) {
        return NextResponse.json(
          { error: "Every agreement for this project must be ACTIVE before work can begin" },
          { status: 400 }
        );
      }
    }
    patch.status = body.status;
  }

  const [updated] = await db.update(scProjects).set(patch).where(eq(scProjects.id, projectId)).returning();

  await logAudit({
    actor: user,
    action: "keelconnect.project.updated",
    entityType: "sc_project",
    entityId: projectId,
    scOrganizationId: before.clientOrgId,
    beforeValue: JSON.stringify(before),
    afterValue: JSON.stringify(updated),
  });

  return NextResponse.json(updated);
}
