import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prComplianceRecords } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPrComplianceRecord, rolesInOrg, getPrMemberships } from "@/lib/projectrequesta/access";
import { logAudit } from "@/lib/audit";

const COMPLIANCE_TYPES = ["KYC", "KYB", "SANCTIONS_SCREENING", "TAX_FORM"] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessPrComplianceRecord(user, orgId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await db.select().from(prComplianceRecords).where(eq(prComplianceRecords.prOrganizationId, orgId)));
}

// Any member of the org can submit a compliance record (e.g. upload a tax form) -- it's
// always created PENDING regardless of who submits it. Only Platform Compliance
// Officer/Admin can later move it to VERIFIED/REJECTED (see [recordId]/route.ts PATCH) --
// self-submission never self-verifies.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await getPrMemberships(user.id);
  if (!rolesInOrg(memberships, orgId).length && !(await canAccessPrComplianceRecord(user, orgId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!COMPLIANCE_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of: ${COMPLIANCE_TYPES.join(", ")}` }, { status: 400 });
  }

  const [record] = await db
    .insert(prComplianceRecords)
    .values({
      prOrganizationId: orgId,
      type: body.type,
      notes: body.notes || null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    })
    .returning();

  await logAudit({
    actor: user,
    action: "projectrequesta.compliance_record.submitted",
    entityType: "pr_compliance_record",
    entityId: record.id,
    prOrganizationId: orgId,
    afterValue: JSON.stringify(record),
  });

  return NextResponse.json(record, { status: 201 });
}
