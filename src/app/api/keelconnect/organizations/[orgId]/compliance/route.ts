import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scComplianceRecords } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScComplianceRecord, rolesInOrg, getScMemberships } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

const COMPLIANCE_TYPES = ["KYC", "KYB", "SANCTIONS_SCREENING", "TAX_FORM"] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessScComplianceRecord(user, orgId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await db.select().from(scComplianceRecords).where(eq(scComplianceRecords.scOrganizationId, orgId)));
}

// Any member of the org can submit a compliance record (e.g. upload a tax form) -- it's
// always created PENDING regardless of who submits it. Only Platform Compliance
// Officer/Admin can later move it to VERIFIED/REJECTED (see [recordId]/route.ts PATCH) --
// self-submission never self-verifies.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await getScMemberships(user.id);
  if (!rolesInOrg(memberships, orgId).length && !(await canAccessScComplianceRecord(user, orgId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!COMPLIANCE_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of: ${COMPLIANCE_TYPES.join(", ")}` }, { status: 400 });
  }

  const [record] = await db
    .insert(scComplianceRecords)
    .values({
      scOrganizationId: orgId,
      type: body.type,
      notes: body.notes || null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    })
    .returning();

  await logAudit({
    actor: user,
    action: "keelconnect.compliance_record.submitted",
    entityType: "sc_compliance_record",
    entityId: record.id,
    scOrganizationId: orgId,
    afterValue: JSON.stringify(record),
  });

  return NextResponse.json(record, { status: 201 });
}
