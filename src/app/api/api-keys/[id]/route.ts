import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { revokeApiKey, updateApiKey } from "@/lib/apiKeys";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    await revokeApiKey(user, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not revoke API key" }, { status: 400 });
  }
}

// Reconfigures scopes, project restriction, or default assignee on an existing key without
// regenerating it -- see updateApiKey in lib/apiKeys.ts for why that matters (regenerating
// would break the secret the calling application already has wired in).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const updates: { scopes?: string[]; projectId?: string | null; defaultAssigneeUserId?: string | null } = {};
  if (Array.isArray(body.scopes)) {
    updates.scopes = body.scopes.filter((s: unknown) => s === "read" || s === "write");
  }
  if ("projectId" in body) updates.projectId = body.projectId || null;
  if ("defaultAssigneeUserId" in body) updates.defaultAssigneeUserId = body.defaultAssigneeUserId || null;

  try {
    const updated = await updateApiKey(user, id, updates);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not update API key" }, { status: 400 });
  }
}
