import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { updateEmailRoute, deleteEmailRoute } from "@/lib/emailIntake";

// Deactivates rather than hard-deletes -- see deleteEmailRoute in lib/emailIntake.ts, same
// soft-revoke idea as an API key, so the row (and its audit trail on any incidents it already
// created) survives.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    await deleteEmailRoute(user, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not deactivate this address" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const updates: { projectId?: string | null; defaultSeverity?: string; defaultAssigneeUserId?: string | null; isActive?: boolean } = {};
  if ("projectId" in body) updates.projectId = body.projectId || null;
  if ("defaultSeverity" in body) updates.defaultSeverity = body.defaultSeverity;
  if ("defaultAssigneeUserId" in body) updates.defaultAssigneeUserId = body.defaultAssigneeUserId || null;
  if ("isActive" in body) updates.isActive = !!body.isActive;

  try {
    const updated = await updateEmailRoute(user, id, updates);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not update this address" }, { status: 400 });
  }
}
