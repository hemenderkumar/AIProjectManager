import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scDisputes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScDispute, requireScPlatform } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [dispute] = await db.select().from(scDisputes).where(eq(scDisputes.id, disputeId));
  if (!dispute) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessScDispute(user, { scProjectId: dispute.scProjectId, scAgreementId: dispute.scAgreementId }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(dispute);
}

// Only Platform Compliance Officer/Admin can move a dispute to UNDER_REVIEW/RESOLVED --
// mediation is a platform function, not something either party can self-serve, which is why
// this doesn't reuse the party-based access check the GET above uses.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await params;
  const ctx = await requireScPlatform(["PLATFORM_ADMIN", "PLATFORM_COMPLIANCE_OFFICER"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [before] = await db.select().from(scDisputes).where(eq(scDisputes.id, disputeId));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.status) {
    if (!["OPEN", "UNDER_REVIEW", "RESOLVED"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = body.status;
    if (body.status === "RESOLVED") patch.resolvedAt = new Date();
  }
  if ("resolutionNotes" in body) patch.resolutionNotes = body.resolutionNotes;

  const [updated] = await db.update(scDisputes).set(patch).where(eq(scDisputes.id, disputeId)).returning();

  await logAudit({
    actor: ctx.user,
    action: "keelconnect.dispute.updated",
    entityType: "sc_dispute",
    entityId: disputeId,
    beforeValue: JSON.stringify(before),
    afterValue: JSON.stringify(updated),
  });

  return NextResponse.json(updated);
}
