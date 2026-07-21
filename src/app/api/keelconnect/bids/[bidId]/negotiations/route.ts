import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scNegotiationEntries, scBids, scProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScBid, getScMemberships, clientOrgIds, vendorOrgIds, hasPlatformRole } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ bidId: string }> }) {
  const { bidId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessScBid(user, bidId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db
    .select()
    .from(scNegotiationEntries)
    .where(eq(scNegotiationEntries.scBidId, bidId))
    .orderBy(scNegotiationEntries.createdAt);
  return NextResponse.json(rows);
}

// Appends one counteroffer to the bid's negotiation thread, from whichever side (Client or
// Vendor) the caller belongs to, and updates the bid's own headline price/status to reflect
// the latest offer -- so scBids always shows "where things currently stand" while
// scNegotiationEntries preserves the full back-and-forth history. Only usable while the bid
// is still open to discussion (SUBMITTED or COUNTERED); once ACCEPTED/REJECTED the thread is
// closed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ bidId: string }> }) {
  const { bidId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [bid] = await db.select().from(scBids).where(eq(scBids.id, bidId));
  if (!bid) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (bid.status !== "SUBMITTED" && bid.status !== "COUNTERED") {
    return NextResponse.json({ error: `Bid is ${bid.status}; negotiation is closed` }, { status: 400 });
  }
  const [project] = await db.select().from(scProjects).where(eq(scProjects.id, bid.scProjectId));
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const memberships = await getScMemberships(user.id);
  const isPlatform = hasPlatformRole(memberships);
  const isClientSide = clientOrgIds(memberships).includes(project.clientOrgId);
  const isVendorSide = vendorOrgIds(memberships).includes(bid.vendorOrgId);
  if (!isPlatform && !isClientSide && !isVendorSide) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const price = Number(body.price);
  if (!price || Number.isNaN(price)) {
    return NextResponse.json({ error: "price must be a positive number" }, { status: 400 });
  }

  const proposedByOrgType = isVendorSide && !isClientSide ? "VENDOR" : "CLIENT";

  const [entry] = await db
    .insert(scNegotiationEntries)
    .values({
      scBidId: bidId,
      price,
      currency: body.currency || bid.currency,
      terms: body.terms || null,
      proposedByUserId: user.id,
      proposedByOrgType,
    })
    .returning();

  const [updatedBid] = await db
    .update(scBids)
    .set({ status: "COUNTERED", proposedPrice: price, currency: body.currency || bid.currency, updatedAt: new Date() })
    .where(eq(scBids.id, bidId))
    .returning();

  await logAudit({
    actor: user,
    action: "keelconnect.negotiation.entry_added",
    entityType: "sc_negotiation_entry",
    entityId: entry.id,
    scOrganizationId: isVendorSide && !isClientSide ? bid.vendorOrgId : project.clientOrgId,
    afterValue: JSON.stringify({ entry, updatedBid }),
  });

  return NextResponse.json({ entry, bid: updatedBid }, { status: 201 });
}
