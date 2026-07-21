import { db } from "../db";
import { scAgreements, scAgreementParties, scProjects, scBids } from "../db/schema";
import { logAudit } from "../audit";
import type { SessionUser } from "../auth";

// The polymorphic Agreement-generation step, run once immediately after a Bid is accepted
// (see bids/[bidId]/route.ts PATCH). Which Agreement rows come out depends entirely on the
// parent Project's engagementModel:
//   - MEDIATOR: Keel is a contracting party on both sides, so two agreements are created --
//     CLIENT_PLATFORM (Client + Platform) and PLATFORM_VENDOR (Platform + Vendor) -- both
//     priced off the same accepted bid, so the client and vendor never need to see each
//     other's contract terms directly.
//   - MARKETPLACE: Keel just matched the two sides, so a single CLIENT_VENDOR agreement is
//     created with the platform not a party to it at all.
// Returns the created agreements (with their party rows) so the caller can include them in
// its response/audit entry.
export async function generateAgreementsForAcceptedBid(
  project: typeof scProjects.$inferSelect,
  bid: typeof scBids.$inferSelect,
  actor: SessionUser
) {
  const created: { agreement: typeof scAgreements.$inferSelect; parties: (typeof scAgreementParties.$inferSelect)[] }[] = [];

  async function createAgreement(
    type: "CLIENT_PLATFORM" | "PLATFORM_VENDOR" | "CLIENT_VENDOR",
    parties: { partyRole: "CLIENT" | "VENDOR" | "PLATFORM"; scOrganizationId: string | null }[]
  ) {
    const [agreement] = await db
      .insert(scAgreements)
      .values({
        scProjectId: project.id,
        scBidId: bid.id,
        type,
        status: "DRAFT",
      })
      .returning();
    const partyRows = await db
      .insert(scAgreementParties)
      .values(parties.map((p) => ({ scAgreementId: agreement.id, partyRole: p.partyRole, scOrganizationId: p.scOrganizationId })))
      .returning();

    await logAudit({
      actor,
      action: "keelconnect.agreement.generated",
      entityType: "sc_agreement",
      entityId: agreement.id,
      scOrganizationId: project.clientOrgId,
      afterValue: JSON.stringify({ agreement, parties: partyRows }),
    });

    created.push({ agreement, parties: partyRows });
  }

  if (project.engagementModel === "MEDIATOR") {
    await createAgreement("CLIENT_PLATFORM", [
      { partyRole: "CLIENT", scOrganizationId: project.clientOrgId },
      { partyRole: "PLATFORM", scOrganizationId: null },
    ]);
    await createAgreement("PLATFORM_VENDOR", [
      { partyRole: "PLATFORM", scOrganizationId: null },
      { partyRole: "VENDOR", scOrganizationId: bid.vendorOrgId },
    ]);
  } else {
    await createAgreement("CLIENT_VENDOR", [
      { partyRole: "CLIENT", scOrganizationId: project.clientOrgId },
      { partyRole: "VENDOR", scOrganizationId: bid.vendorOrgId },
    ]);
  }

  return created;
}
