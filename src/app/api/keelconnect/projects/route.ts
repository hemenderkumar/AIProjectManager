import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scProjects } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getScMemberships, rolesInOrg, listScProjectsForUser } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

// Marketplace "browse" list. Client roles see only their own org's projects; Vendor roles
// see the open marketplace plus anything they've already bid on; Platform sees everything.
// See listScProjectsForUser for the exact visibility rule.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listScProjectsForUser(user));
}

// A Client org posts a project. Requester or Org Admin can draft/post it; Finance Approver
// deliberately cannot (spec scopes that role to payment approval, not project creation).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const clientOrgId = String(body.clientOrgId || "");
  if (!clientOrgId) return NextResponse.json({ error: "clientOrgId is required" }, { status: 400 });

  const memberships = await getScMemberships(user.id);
  const myRolesInOrg = rolesInOrg(memberships, clientOrgId);
  if (!myRolesInOrg.includes("CLIENT_ORG_ADMIN") && !myRolesInOrg.includes("CLIENT_REQUESTER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const [project] = await db
    .insert(scProjects)
    .values({
      clientOrgId,
      postedByUserId: user.id,
      title: String(body.title).trim(),
      description: body.description || null,
      category: body.category || null,
      targetBudget: typeof body.targetBudget === "number" ? body.targetBudget : null,
      currency: body.currency || "USD",
      deadline: body.deadline ? new Date(body.deadline) : null,
      engagementModel: body.engagementModel === "MEDIATOR" ? "MEDIATOR" : "MARKETPLACE",
      locationRequirement: body.locationRequirement === "RESTRICTED" ? "RESTRICTED" : "GLOBAL",
      restrictedCountries: Array.isArray(body.restrictedCountries) ? body.restrictedCountries : null,
      status: "DRAFT",
    })
    .returning();

  await logAudit({
    actor: user,
    action: "keelconnect.project.created",
    entityType: "sc_project",
    entityId: project.id,
    scOrganizationId: clientOrgId,
    afterValue: JSON.stringify(project),
  });

  return NextResponse.json(project, { status: 201 });
}
