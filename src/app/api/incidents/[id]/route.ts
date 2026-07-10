import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { incidents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

const dateFields = ["reportedAt", "resolvedAt"] as const;
const allowed = [
  "projectId", "title", "description", "severity", "status",
  "reportedBy", "assignee", "reportedAt", "resolvedAt", "resolutionNotes", "aiRecommendation",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in body)) continue;
    const v = body[key];
    if ((dateFields as readonly string[]).includes(key)) {
      update[key] = v ? new Date(v) : null;
    } else {
      update[key] = v === "" ? null : v;
    }
  }
  // Auto-stamp resolvedAt when moving into RESOLVED/CLOSED, if the caller didn't set one.
  if ((body.status === "RESOLVED" || body.status === "CLOSED") && !("resolvedAt" in body)) {
    update.resolvedAt = new Date();
  }

  const [updated] = await db.update(incidents).set(update).where(eq(incidents.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await db.delete(incidents).where(eq(incidents.id, id));
  return NextResponse.json({ ok: true });
}
