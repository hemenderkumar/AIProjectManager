import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scComplianceRecords, scOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireScPlatform } from "@/lib/keelconnect/access";

// Platform Compliance Officer/Admin queue: every compliance record across every
// organization, joined with the org name so the admin console doesn't need N follow-up
// requests to label each row.
export async function GET() {
  const ctx = await requireScPlatform(["PLATFORM_ADMIN", "PLATFORM_COMPLIANCE_OFFICER", "PLATFORM_SUPPORT"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({
      id: scComplianceRecords.id,
      type: scComplianceRecords.type,
      status: scComplianceRecords.status,
      createdAt: scComplianceRecords.createdAt,
      scOrganizationId: scComplianceRecords.scOrganizationId,
      organizationName: scOrganizations.name,
    })
    .from(scComplianceRecords)
    .innerJoin(scOrganizations, eq(scComplianceRecords.scOrganizationId, scOrganizations.id));

  return NextResponse.json(rows);
}
