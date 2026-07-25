import { db } from "../db";
import { prAgreements, prAgreementParties, prProjects, prBids } from "../db/schema";
import { logAudit } from "../audit";
import type { SessionUser } from "../auth";

// The polymorphic Agreement-generation step, run once immediately after a Bid is accepted
// (see bids/[bidId]/route.ts PATCH). Which Agreement rows come out depends entirely on the
// parent Project's engagementModel:
//   - MEDIATOR: Executa is a contracting party on both sides, so two agreements are created --
//     CLIENT_PLATFORM (Client + Platform) and PLATFORM_VENDOR (Platform + Vendor) -- both
//     priced off the same accepted bid, so the client and vendor never need to see each
//     other's contract terms directly.
//   - MARKETPLACE: Executa just matched the two sides, so a single CLIENT_VENDOR agreement is
//     created with the platform not a party to it at all.
// Returns the created agreements (with their party rows) so the caller can include them in
// its response/audit entry.
export async function generateAgreementsForAcceptedBid(
  project: typeof prProjects.$inferSelect,
  bid: typeof prBids.$inferSelect,
  actor: SessionUser
) {
  const created: { agreement: typeof prAgreements.$inferSelect; parties: (typeof prAgreementParties.$inferSelect)[] }[] = [];

  async function createAgreement(
    type: "CLIENT_PLATFORM" | "PLATFORM_VENDOR" | "CLIENT_VENDOR",
    parties: { partyRole: "CLIENT" | "VENDOR" | "PLATFORM"; prOrganizationId: string | null }[]
  ) {
    const [agreement] = await db
      .insert(prAgreements)
      .values({
        prProjectId: project.id,
        prBidId: bid.id,
        type,
        status: "DRAFT",
      })
      .returning();
    const partyRows = await db
      .insert(prAgreementParties)
      .values(parties.map((p) => ({ prAgreementId: agreement.id, partyRole: p.partyRole, prOrganizationId: p.prOrganizationId })))
      .returning();

    await logAudit({
      actor,
      action: "projectrequesta.agreement.generated",
      entityType: "pr_agreement",
      entityId: agreement.id,
      prOrganizationId: project.clientOrgId,
      afterValue: JSON.stringify({ agreement, parties: partyRows }),
    });

    created.push({ agreement, parties: partyRows });
  }

  if (project.engagementModel === "MEDIATOR") {
    await createAgreement("CLIENT_PLATFORM", [
      { partyRole: "CLIENT", prOrganizationId: project.clientOrgId },
      { partyRole: "PLATFORM", prOrganizationId: null },
    ]);
    await createAgreement("PLATFORM_VENDOR", [
      { partyRole: "PLATFORM", prOrganizationId: null },
      { partyRole: "VENDOR", prOrganizationId: bid.vendorOrgId },
    ]);
  } else {
    await createAgreement("CLIENT_VENDOR", [
      { partyRole: "CLIENT", prOrganizationId: project.clientOrgId },
      { partyRole: "VENDOR", prOrganizationId: bid.vendorOrgId },
    ]);
  }

  return created;
}
