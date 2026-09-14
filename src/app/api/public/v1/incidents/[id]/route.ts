import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { incidents, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyApiKey, extractBearerToken, isApiKeyAllowedForProject } from "@/lib/apiKeys";
import { isValidAssigneeForOrg } from "@/lib/incidents";
import { dispatchWebhook } from "@/lib/webhooks";

// Fields a calling application may update after an incident already exists -- deliberately
// narrower than the internal session-based PATCH_ALLOWED_FIELDS in lib/incidents.ts (no
// retitling or reprojecting an incident through the integration surface). This is the pair of
// things an external ITSM/ticketing tool actually needs to push back into Executa: who owns it
// and where it stands.
const PATCHABLE_FIELDS = ["status", "assignee", "assigneeUserId", "resolutionNotes"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawKey = extractBearerToken(req.headers.get("authorization"));
  if (!rawKey) return NextResponse.json({ error: "Missing Authorization: Bearer <api key>" }, { status: 401 });
  const auth = await verifyApiKey(rawKey);
  if (!auth) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  if (!auth.scopes.includes("write")) {
    return NextResponse.json({ error: "This API key doesn't have write access" }, { status: 403 });
  }

  const [existing] = await db.select().from(incidents).where(eq(incidents.id, id));
  if (!existing) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  if (!isApiKeyAllowedForProject(auth, existing.projectId)) {
    return NextResponse.json({ error: "This API key is restricted to a different project" }, { status: 403 });
  }
  if (auth.organizationId) {
    // Same visibility rule as GET on the collection: an org-scoped key only ever touches
    // incidents linked to one of that org's own projects -- an unlinked (internal-only)
    // incident is off-limits, same as it is to a SUPER_USER session.
    if (!existing.projectId) {
      return NextResponse.json({ error: "Incident not accessible to this API key" }, { status: 403 });
    }
    const [project] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, existing.projectId));
    if (!project || project.organizationId !== auth.organizationId) {
      return NextResponse.json({ error: "Incident not accessible to this API key" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  for (const key of PATCHABLE_FIELDS) {
    if (!(key in body)) continue;
    update[key] = body[key] === "" ? null : body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: `No recognized fields in body. Supported: ${PATCHABLE_FIELDS.join(", ")}` }, { status: 400 });
  }

  if (typeof update.assigneeUserId === "string") {
    const ok = await isValidAssigneeForOrg(update.assigneeUserId, auth.organizationId);
    if (!ok) return NextResponse.json({ error: "assigneeUserId is not a valid user for this API key's organization" }, { status: 400 });
  }

  // Same auto-stamp behavior as the internal PATCH (lib/incidents.ts patchIncident) -- an
  // integration moving status through the API shouldn't silently skip the timestamps that
  // drive SLA/MTTR reporting just because the update came in through a different door.
  if (update.status === "IN_PROGRESS" && !existing.acknowledgedAt) {
    update.acknowledgedAt = new Date();
  }
  if ((update.status === "RESOLVED" || update.status === "CLOSED") && !existing.resolvedAt) {
    update.resolvedAt = new Date();
  }

  const [updated] = await db.update(incidents).set(update).where(eq(incidents.id, id)).returning();

  if ("status" in update && update.status !== existing.status) {
    const orgId = updated.projectId
      ? (await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, updated.projectId)))[0]?.organizationId ?? null
      : null;
    await dispatchWebhook(orgId, "INCIDENT_STATUS_CHANGED", {
      id: updated.id, title: updated.title, previousStatus: existing.status, status: updated.status, projectId: updated.projectId, source: "public-api", application: auth.name,
    });
  }

  return NextResponse.json({ data: updated });
}
