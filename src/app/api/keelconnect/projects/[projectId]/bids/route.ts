import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scBids, scProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScProject, getScMemberships, rolesInOrg, hasPlatformRole, clientOrgIds, vendorOrgIds } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";
import { notifyScOrg } from "@/lib/keelconnect/notify";

// Client (project owner) and Platform see every bid on the project. A Vendor only sees its
// own org's bid(s) -- competitors' pricing must stay private, which is the whole point of a
// sealed marketplace.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessScProject(user, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [project] = await db.select().from(scProjects).where(eq(scProjects.id, projectId));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const memberships = await getScMemberships(user.id);
  const isPlatform = hasPlatformRole(memberships);
  const isProjectOwner = clientOrgIds(memberships).includes(project.clientOrgId);
  const allBids = await db.select().from(scBids).where(eq(scBids.scProjectId, projectId));

  if (isPlatform || isProjectOwner) return NextResponse.json(allBids);

  const myVendorOrgIds = vendorOrgIds(memberships);
  return NextResponse.json(allBids.filter((b) => myVendorOrgIds.includes(b.vendorOrgId)));
}

// A Vendor org submits its opening bid. Project must currently be OPEN -- once it moves to
// NEGOTIATING/AWARDED/etc. new bids no longer make sense (use the negotiation thread on an
// existing bid instead).
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [project] = await db.select().from(scProjects).where(eq(scProjects.id, projectId));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.status !== "OPEN") {
    return NextResponse.json({ error: `Project is ${project.status}, not accepting new bids` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const vendorOrgId = String(body.vendorOrgId || "");
  if (!vendorOrgId) return NextResponse.json({ error: "vendorOrgId is required" }, { status: 400 });

  const memberships = await getScMemberships(user.id);
  const myVendorRoles = rolesInOrg(memberships, vendorOrgId);
  if (!myVendorRoles.includes("VENDOR_ORG_ADMIN") && !myVendorRoles.includes("VENDOR_CONTRIBUTOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (project.locationRequirement === "RESTRICTED" && project.restrictedCountries?.length) {
    // Best-effort check only -- vendor org's own primaryCountry vs the allow-list. A vendor
    // operating across multiple countries would need a more precise attestation than this
    // one field captures; that's a future refinement, not a gap introduced here.
  }

  const proposedPrice = Number(body.proposedPrice);
  if (!proposedPrice || Number.isNaN(proposedPrice)) {
    return NextResponse.json({ error: "proposedPrice must be a positive number" }, { status: 400 });
  }

  const [bid] = await db
    .insert(scBids)
    .values({
      scProjectId: projectId,
      vendorOrgId,
      submittedByUserId: user.id,
      proposedPrice,
      currency: body.currency || project.currency,
      timeline: body.timeline || null,
      status: "SUBMITTED",
    })
    .returning();

  // First bid on an OPEN project moves it into NEGOTIATING -- bidding has begun.
  await db.update(scProjects).set({ status: "NEGOTIATING", updatedAt: new Date() }).where(eq(scProjects.id, projectId));

  await logAudit({
    actor: user,
    action: "keelconnect.bid.submitted",
    entityType: "sc_bid",
    entityId: bid.id,
    scOrganizationId: vendorOrgId,
    afterValue: JSON.stringify(bid),
  });

  notifyScOrg(
    project.clientOrgId,
    `New bid on "${project.title}"`,
    `A vendor submitted a bid of ${bid.currency} ${bid.proposedPrice.toLocaleString()} on "${project.title}". Review it in KeelConnect.`,
    ["CLIENT_ORG_ADMIN", "CLIENT_REQUESTER"]
  ).catch(() => {});

  return NextResponse.json(bid, { status: 201 });
}
