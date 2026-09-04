import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { incidents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { canAccessOptionalProject } from "@/lib/tenancy";
import { patchIncident } from "@/lib/incidents";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const result = await patchIncident(user, id, body);
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 403;
    return NextResponse.json({ error: result.error === "not_found" ? "not found" : "Forbidden" }, { status });
  }
  return NextResponse.json(result.incident);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [existing] = await db.select().from(incidents).where(eq(incidents.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canAccessOptionalProject(_authUser, existing.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(incidents).where(eq(incidents.id, id));
  return NextResponse.json({ ok: true });
}
