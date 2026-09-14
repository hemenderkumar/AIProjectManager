import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { incidents, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyApiKey, extractBearerToken, isApiKeyAllowedForProject, resolveApiKeyProjectId } from "@/lib/apiKeys";
import { isValidAssigneeForOrg } from "@/lib/incidents";
import { dispatchWebhook } from "@/lib/webhooks";

// Same key-scoped visibility rule as /api/public/v1/projects (#322): a key created for a
// specific organization sees that org's incidents plus unlinked/internal-only ones; an
// internal (org-less) key sees everything. This is the generic integration surface for
// incident management -- an external ITSM/on-call tool (or a Zapier/Make zap) reads and
// writes incidents here rather than needing a bespoke connector.
export async function GET(req: NextRequest) {
  const rawKey = extractBearerToken(req.headers.get("authorization"));
  if (!rawKey) return NextResponse.json({ error: "Missing Authorization: Bearer <api key>" }, { status: 401 });
  const auth = await verifyApiKey(rawKey);
  if (!auth) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });

  if (!auth.organizationId) {
    const data = await db.select().from(incidents);
    return NextResponse.json({ data });
  }

  // An incident's org is derived from its linked project -- an org-scoped key only sees
  // incidents linked to that org's own projects, same as a SUPER_USER session (unlinked
  // incidents are internal-staff-only in the app UI too, so they're excluded here as well).
  const rows = await db
    .select({ incident: incidents })
    .from(incidents)
    .innerJoin(projects, eq(incidents.projectId, projects.id))
    .where(eq(projects.organizationId, auth.organizationId));
  // A project-restricted key (see isApiKeyAllowedForProject) narrows further, on top of the
  // org filter above -- it only ever sees the one project it was issued for.
  const visible = auth.projectId ? rows.filter((r) => r.incident.projectId === auth.projectId) : rows;
  return NextResponse.json({ data: visible.map((r) => r.incident) });
}

export async function POST(req: NextRequest) {
  const rawKey = extractBearerToken(req.headers.get("authorization"));
  if (!rawKey) return NextResponse.json({ error: "Missing Authorization: Bearer <api key>" }, { status: 401 });
  const auth = await verifyApiKey(rawKey);
  if (!auth) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  if (!auth.scopes.includes("write")) {
    return NextResponse.json({ error: "This API key doesn't have write access" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // A key scoped to an organization may only file incidents against that org's own projects
  // (or leave it unlinked) -- it can't attach an incident to another organization's project.
  // A key that's ALSO project-restricted (see isApiKeyAllowedForProject) narrows this further:
  // it can only ever file against that one project. resolveApiKeyProjectId lets a
  // project-restricted key omit projectId from the request entirely and have it default to
  // the project the key was issued for -- a single-project integration shouldn't have to pass
  // the same projectId on every call.
  const requestedProjectId: string | null = body.projectId || null;
  const projectId = resolveApiKeyProjectId(auth, requestedProjectId);
  if (!isApiKeyAllowedForProject(auth, projectId)) {
    return NextResponse.json({ error: "This API key is restricted to a different project" }, { status: 403 });
  }
  if (projectId && auth.organizationId) {
    const [project] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, projectId));
    if (!project || (project.organizationId && project.organizationId !== auth.organizationId)) {
      return NextResponse.json({ error: "projectId is not accessible to this API key" }, { status: 403 });
    }
  }

  // assigneeUserId links the incident to a real Executa user (drives the assignee picker,
  // notifications, etc.) rather than just a free-text name. It must belong to the same
  // organization as an org-scoped key -- an unrestricted (internal) key can assign to anyone.
  // If the caller doesn't pass one, fall back to the key's own configured default assignee
  // (see Settings > Integrations) -- this is what makes routing fully no-code: an admin sets
  // "everything from this key goes to Jane" once in the UI, and a calling application that
  // just POSTs a bare title still ends up correctly assigned.
  const requestedAssigneeUserId: string | null = body.assigneeUserId || auth.defaultAssigneeUserId || null;
  if (requestedAssigneeUserId && !(await isValidAssigneeForOrg(requestedAssigneeUserId, auth.organizationId))) {
    return NextResponse.json({ error: "assigneeUserId is not a valid user for this API key's organization" }, { status: 400 });
  }

  const severity = body.severity || "MEDIUM";
  const [created] = await db
    .insert(incidents)
    .values({
      projectId,
      title: body.title,
      description: body.description || null,
      severity: severity as (typeof incidents.$inferInsert)["severity"],
      status: (body.status || "OPEN") as (typeof incidents.$inferInsert)["status"],
      // Falls back to the key's own name (the "which application" label an admin set when
      // creating it) so a ticket filed by an integration that didn't bother passing reportedBy
      // still shows something more useful than blank -- e.g. "Datadog" instead of nothing.
      reportedBy: body.reportedBy || auth.name,
      assignee: body.assignee || null,
      assigneeUserId: requestedAssigneeUserId,
      escalatedAt: severity === "CRITICAL" ? new Date() : null,
      createdViaApiKeyId: auth.keyId,
    })
    .returning();

  const orgId = projectId
    ? (await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, projectId)))[0]?.organizationId ?? null
    : null;
  await dispatchWebhook(orgId, "INCIDENT_CREATED", {
    id: created.id, title: created.title, severity: created.severity, status: created.status, projectId: created.projectId, source: "public-api", application: auth.name,
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
