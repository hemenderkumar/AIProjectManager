import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { escalations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

// PM+ resolves/updates an escalation -- lighter-weight tier than budget change requests
// (SUPER_USER) since this is a status/ownership update, not a financial decision.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; escId: string }> }
) {
  const { id, escId } = await params;
  const user = await requireProjectAccess("PM", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();

  const values: Record<string, unknown> = {};
  if ("status" in body) values.status = body.status;
  if ("owner" in body) values.owner = body.owner || null;
  if ("severity" in body) values.severity = body.severity;
  if ("resolution" in body) values.resolution = body.resolution || null;
  if (body.status === "RESOLVED") values.resolvedAt = new Date();

  const [updated] = await db
    .update(escalations)
    .set(values)
    .where(eq(escalations.id, escId))
    .returning();
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logAudit({
    actor: user,
    action: "escalation.updated",
    entityType: "escalation",
    entityId: updated.id,
    detail: `Updated escalation "${updated.title}" (status: ${updated.status})`,
  });

  return NextResponse.json(updated);
}
