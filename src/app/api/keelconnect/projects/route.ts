import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scProjects } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getScMemberships, rolesInOrg, listScProjectsForUser } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

// Marketplace "browse" list. Client roles see only their own org's projects; Vendor roles
// see the open marketplace plus anything they've already bid on; Platform sees everything.
// See listScProjectsForUser for the exact visibility rule. Search/filter (#255) is applied
// on top of that visibility-scoped list, in-process rather than in SQL -- the visibility
// query itself is already bounded to "my org's projects" or "the open marketplace", not an
// unbounded table scan, so this doesn't have the N+1/full-table problem #260 is fixing.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await listScProjectsForUser(user);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase() || "";
  const category = searchParams.get("category")?.trim().toLowerCase() || "";
  const skill = searchParams.get("skill")?.trim().toLowerCase() || "";
  const minBudget = searchParams.get("minBudget") ? Number(searchParams.get("minBudget")) : null;
  const maxBudget = searchParams.get("maxBudget") ? Number(searchParams.get("maxBudget")) : null;
  const requestType = searchParams.get("requestType");
  const engagementModel = searchParams.get("engagementModel");
  const status = searchParams.get("status");

  const filtered = projects
    .filter((p) => !q || p.title.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q))
    .filter((p) => !category || (p.category ?? "").toLowerCase().includes(category))
    .filter((p) => !skill || (p.skillsRequired ?? []).some((s) => s.toLowerCase().includes(skill)))
    .filter((p) => minBudget == null || (p.targetBudget ?? 0) >= minBudget)
    .filter((p) => maxBudget == null || (p.targetBudget ?? Infinity) <= maxBudget)
    .filter((p) => !requestType || p.requestType === requestType)
    .filter((p) => !engagementModel || p.engagementModel === engagementModel)
    .filter((p) => !status || p.status === status);

  return NextResponse.json(filtered);
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

  const requestType = body.requestType === "RESOURCE_REQUEST" ? "RESOURCE_REQUEST" : "PROJECT";
  const RATE_TYPES = ["HOURLY", "DAILY", "WEEKLY", "FIXED"];

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
      requestType,
      skillsRequired: requestType === "RESOURCE_REQUEST" && Array.isArray(body.skillsRequired) ? body.skillsRequired : null,
      durationWeeks: requestType === "RESOURCE_REQUEST" && typeof body.durationWeeks === "number" ? body.durationWeeks : null,
      rateType: requestType === "RESOURCE_REQUEST" && RATE_TYPES.includes(body.rateType) ? body.rateType : null,
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
