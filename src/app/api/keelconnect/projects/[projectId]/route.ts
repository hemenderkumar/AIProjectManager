import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scProjects } from "@/lib/db/schema";
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
// DRAFT -> OPEN, or CANCELLED at any point before AWARDED. Awarding itself happens as a side
// effect of accepting a bid (see bids/[bidId] PATCH), not through this route directly.
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
  for (const key of ["title", "description", "category", "targetBudget", "currency", "engagementModel", "locationRequirement", "restrictedCountries"]) {
    if (key in body) patch[key] = body[key];
  }
  if (body.deadline !== undefined) patch.deadline = body.deadline ? new Date(body.deadline) : null;
  if (body.status) {
    const validTransitions: Record<string, string[]> = {
      DRAFT: ["OPEN", "CANCELLED"],
      OPEN: ["NEGOTIATING", "CANCELLED"],
      NEGOTIATING: ["OPEN", "CANCELLED"],
    };
    if (!validTransitions[before.status]?.includes(body.status) && !isPlatform) {
      return NextResponse.json({ error: `Cannot move project from ${before.status} to ${body.status}` }, { status: 400 });
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
