import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scComplianceRecords } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireScPlatform } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

const VERIFICATION_STATUSES = ["PENDING", "VERIFIED", "REJECTED"] as const;

// Platform Compliance Officer/Admin only -- this is the actual KYC/KYB/sanctions/tax
// verification decision, so it's audit-logged with a full before/after snapshot per the
// spec's "audit every compliance decision" requirement.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const ctx = await requireScPlatform(["PLATFORM_ADMIN", "PLATFORM_COMPLIANCE_OFFICER"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [before] = await db.select().from(scComplianceRecords).where(eq(scComplianceRecords.id, recordId));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!VERIFICATION_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${VERIFICATION_STATUSES.join(", ")}` }, { status: 400 });
  }

  const [updated] = await db
    .update(scComplianceRecords)
    .set({
      status: body.status,
      verifiedAt: body.status === "VERIFIED" ? new Date() : before.verifiedAt,
      notes: "notes" in body ? body.notes : before.notes,
    })
    .where(eq(scComplianceRecords.id, recordId))
    .returning();

  await logAudit({
    actor: ctx.user,
    action: "keelconnect.compliance_record.decided",
    entityType: "sc_compliance_record",
    entityId: recordId,
    scOrganizationId: before.scOrganizationId,
    beforeValue: JSON.stringify(before),
    afterValue: JSON.stringify(updated),
  });

  return NextResponse.json(updated);
}
