import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prComplianceRecords, prOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requirePrPlatform } from "@/lib/projectrequesta/access";

// Platform Compliance Officer/Admin queue: every compliance record across every
// organization, joined with the org name so the admin console doesn't need N follow-up
// requests to label each row.
export async function GET() {
  const ctx = await requirePrPlatform(["PLATFORM_ADMIN", "PLATFORM_COMPLIANCE_OFFICER", "PLATFORM_SUPPORT"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({
      id: prComplianceRecords.id,
      type: prComplianceRecords.type,
      status: prComplianceRecords.status,
      createdAt: prComplianceRecords.createdAt,
      prOrganizationId: prComplianceRecords.prOrganizationId,
      organizationName: prOrganizations.name,
    })
    .from(prComplianceRecords)
    .innerJoin(prOrganizations, eq(prComplianceRecords.prOrganizationId, prOrganizations.id));

  return NextResponse.json(rows);
}
