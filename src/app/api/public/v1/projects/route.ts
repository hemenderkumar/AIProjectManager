import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq, isNull, or } from "drizzle-orm";
import { verifyApiKey, extractBearerToken } from "@/lib/apiKeys";

// The public API surface (#322) — key-scoped, not session-scoped. A key created for a
// specific organization only ever sees that organization's projects (plus internal-only
// projects, organizationId null, same visibility rule the in-app UI uses for ADMIN/internal
// staff). An internal (org-less) key sees everything, mirroring an ADMIN session.
export async function GET(req: NextRequest) {
  const rawKey = extractBearerToken(req.headers.get("authorization"));
  if (!rawKey) return NextResponse.json({ error: "Missing Authorization: Bearer <api key>" }, { status: 401 });
  const auth = await verifyApiKey(rawKey);
  if (!auth) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });

  const data = auth.organizationId
    ? await db.select().from(projects).where(or(eq(projects.organizationId, auth.organizationId), isNull(projects.organizationId)))
    : await db.select().from(projects);

  return NextResponse.json({ data });
}
