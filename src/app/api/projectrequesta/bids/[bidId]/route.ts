import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prBids, prProjects } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPrBid, getPrMemberships, clientOrgIds, hasPlatformRole } from "@/lib/projectrequesta/access";
import { generateAgreementsForAcceptedBid } from "@/lib/projectrequesta/agreements";
import { logAudit } from "@/lib/audit";
import { notifyPrOrg } from "@/lib/projectrequesta/notify";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ bidId: string }> }) {
  const { bidId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessPrBid(user, bidId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [bid] = await db.select().from(prBids).where(eq(prBids.id, bidId));
  if (!bid) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(bid);
}

// Accept or reject a bid. Only the project's owning Client org (Requester/Org Admin) or
// Platform Admin can decide. Accepting a bid is a significant enough state change (it
// determines who the project is awarded to) that it's audit-logged with before/after, and it
// cascades: the project moves to AWARDED, every other outstanding bid on it is auto-rejected,
// and the polymorphic Agreement(s) for the project's engagementModel are generated
// immediately (see lib/projectrequesta/agreements.ts) so award and contract creation happen
// atomically rather than requiring a separate follow-up step.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ bidId: string }> }) {
  const { bidId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [before] = await db.select().from(prBids).where(eq(prBids.id, bidId));
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [project] = await db.select().from(prProjects).where(eq(prProjects.id, before.prProjectId));
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const memberships = await getPrMemberships(user.id);
  const isPlatform = hasPlatformRole(memberships);
  const isProjectOwner = clientOrgIds(memberships).includes(project.clientOrgId);
  if (!isPlatform && !isProjectOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body.status !== "ACCEPTED" && body.status !== "REJECTED") {
    return NextResponse.json({ error: "status must be ACCEPTED or REJECTED" }, { status: 400 });
  }
  if (before.status === "ACCEPTED" || before.status === "REJECTED") {
    return NextResponse.json({ error: `Bid is already ${before.status}` }, { status: 400 });
  }

  const [updated] = await db
    .update(prBids)
    .set({ status: body.status, updatedAt: new Date() })
    .where(eq(prBids.id, bidId))
    .returning();

  let agreements: Awaited<ReturnType<typeof generateAgreementsForAcceptedBid>> = [];
  if (body.status === "ACCEPTED") {
    await db
      .update(prBids)
      .set({ status: "REJECTED", updatedAt: new Date() })
      .where(and(eq(prBids.prProjectId, before.prProjectId), ne(prBids.id, bidId), eq(prBids.status, "SUBMITTED")));
    await db
      .update(prBids)
      .set({ status: "REJECTED", updatedAt: new Date() })
      .where(and(eq(prBids.prProjectId, before.prProjectId), ne(prBids.id, bidId), eq(prBids.status, "COUNTERED")));
    const [awardedProject] = await db
      .update(prProjects)
      .set({ status: "AWARDED", updatedAt: new Date() })
      .where(eq(prProjects.id, before.prProjectId))
      .returning();
    agreements = await generateAgreementsForAcceptedBid(awardedProject, updated, user);
  }

  await logAudit({
    actor: user,
    action: body.status === "ACCEPTED" ? "projectrequesta.bid.accepted" : "projectrequesta.bid.rejected",
    entityType: "pr_bid",
    entityId: bidId,
    prOrganizationId: project.clientOrgId,
    beforeValue: JSON.stringify(before),
    afterValue: JSON.stringify(updated),
  });

  notifyPrOrg(
    updated.vendorOrgId,
    body.status === "ACCEPTED" ? `Your bid on "${project.title}" was accepted` : `Your bid on "${project.title}" was not selected`,
    body.status === "ACCEPTED"
      ? `Congratulations — your bid of ${updated.currency} ${updated.proposedPrice.toLocaleString()} on "${project.title}" was accepted. The agreement is ready in ProjectRequesta.`
      : `Your bid on "${project.title}" was not selected this time.`,
    ["VENDOR_ORG_ADMIN", "VENDOR_CONTRIBUTOR"]
  ).catch(() => {});

  return NextResponse.json({ ...updated, agreements });
}
