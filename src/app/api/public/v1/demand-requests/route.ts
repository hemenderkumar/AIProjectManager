import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { demandRequests } from "@/lib/db/schema";
import { eq, isNull, or } from "drizzle-orm";
import { verifyApiKey, extractBearerToken } from "@/lib/apiKeys";
import { submitDemand } from "@/lib/demand";

// Same key-scoped visibility rule as /api/public/v1/projects and /incidents: an org-scoped
// key sees that org's demand requests plus unlinked/internal ones; an internal (org-less) key
// sees everything. This is the generic integration surface for demand management -- an
// external intake tool, ticketing system, or Zapier/Make zap reads and files requests here
// rather than needing a bespoke connector.
export async function GET(req: NextRequest) {
  const rawKey = extractBearerToken(req.headers.get("authorization"));
  if (!rawKey) return NextResponse.json({ error: "Missing Authorization: Bearer <api key>" }, { status: 401 });
  const auth = await verifyApiKey(rawKey);
  if (!auth) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });

  const data = auth.organizationId
    ? await db.select().from(demandRequests).where(or(eq(demandRequests.organizationId, auth.organizationId), isNull(demandRequests.organizationId)))
    : await db.select().from(demandRequests);

  return NextResponse.json({ data });
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
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const requestedByName = String(body.requestedByName ?? "").trim();
  const requestedByEmail = String(body.requestedByEmail ?? "").trim().toLowerCase();
  if (!title || !description || !requestedByName || !requestedByEmail) {
    return NextResponse.json({ error: "title, description, requestedByName, and requestedByEmail are required" }, { status: 400 });
  }

  // An org-scoped key files requests against its own organization only; an internal key may
  // specify one explicitly (or leave it unset for an internal ask), same rule as the public
  // demand form (submitDemand also dispatches DEMAND_REQUEST_CREATED, so this reuses the same
  // path the in-app "Submit a request" form goes through).
  const organizationId = auth.organizationId ?? (body.organizationId || null);
  const created = await submitDemand({
    title, description, requestedByName, requestedByEmail,
    expectedOutcome: body.expectedOutcome || null,
    organizationId,
    type: body.type,
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
