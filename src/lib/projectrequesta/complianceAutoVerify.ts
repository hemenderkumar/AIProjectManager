import { db } from "@/lib/db";
import { prComplianceRecords } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

// Bridges Stripe Connect's own underwriting into Executa's manual KYC/KYB compliance system.
// A Vendor org's Standard Connect account only reaches charges_enabled + payouts_enabled once
// Stripe has independently verified the business (legal name, tax ID, representative
// identity, bank account) and cleared it through their own sanctions/risk screening -- so
// that outcome is a legitimate basis to auto-satisfy Executa's own compliance records, without
// requiring a redundant manual review of something Stripe already checked.
//
// Deliberately does NOT touch prOrganizations.verificationStatus (the org's overall
// marketplace-facing "Verified" badge) -- that stays a human Platform Admin/Compliance
// Officer decision made after reviewing these records, per #next compliance-automation task.
// Also never overwrites a record already VERIFIED or REJECTED, whether that decision was made
// by a human or by this same function on an earlier webhook delivery -- a person's call (or an
// earlier settled outcome) always wins over a repeat Stripe signal.
const STRIPE_COVERED_TYPES = ["KYB", "KYC", "TAX_FORM", "SANCTIONS_SCREENING"] as const;

const STRIPE_AUTO_VERIFY_NOTE =
  "Auto-verified: Stripe Connect completed this organization's own underwriting (business " +
  "verification, identity, tax details, and sanctions/risk screening) before enabling charges " +
  "and payouts. Not manually reviewed by Executa compliance staff.";

export async function autoVerifyComplianceFromStripe(prOrganizationId: string) {
  for (const type of STRIPE_COVERED_TYPES) {
    const [pending] = await db
      .select()
      .from(prComplianceRecords)
      .where(
        and(
          eq(prComplianceRecords.prOrganizationId, prOrganizationId),
          eq(prComplianceRecords.type, type),
          eq(prComplianceRecords.status, "PENDING")
        )
      )
      .orderBy(desc(prComplianceRecords.createdAt))
      .limit(1);

    if (pending) {
      const [updated] = await db
        .update(prComplianceRecords)
        .set({ status: "VERIFIED", verifiedAt: new Date(), notes: STRIPE_AUTO_VERIFY_NOTE })
        .where(eq(prComplianceRecords.id, pending.id))
        .returning();
      await logAudit({
        actor: null,
        action: "projectrequesta.compliance_record.auto_verified_via_stripe",
        entityType: "pr_compliance_record",
        entityId: pending.id,
        prOrganizationId,
        beforeValue: JSON.stringify(pending),
        afterValue: JSON.stringify(updated),
      });
    } else {
      // The org never self-submitted this record type in Executa -- Stripe's own check is still
      // a valid basis to consider it satisfied, so create one already-decided rather than
      // blocking on a redundant manual submission the org has no reason to make.
      const [created] = await db
        .insert(prComplianceRecords)
        .values({ prOrganizationId, type, status: "VERIFIED", verifiedAt: new Date(), notes: STRIPE_AUTO_VERIFY_NOTE })
        .returning();
      await logAudit({
        actor: null,
        action: "projectrequesta.compliance_record.auto_verified_via_stripe",
        entityType: "pr_compliance_record",
        entityId: created.id,
        prOrganizationId,
        afterValue: JSON.stringify(created),
      });
    }
  }
}
