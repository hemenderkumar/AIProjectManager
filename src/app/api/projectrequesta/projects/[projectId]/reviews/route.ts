import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prReviews, prProjects, prBids } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPrProject, getPrMemberships, clientOrgIds, vendorOrgIds } from "@/lib/projectrequesta/access";
import { logAudit } from "@/lib/audit";
import { notifyPrOrg } from "@/lib/projectrequesta/notify";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessPrProject(user, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await db.select().from(prReviews).where(eq(prReviews.prProjectId, projectId)));
}

// Only once a project is COMPLETED can either side leave a review of the other -- the
// Client (fromOrgType CLIENT) reviewing the awarded Vendor, or that Vendor (fromOrgType
// VENDOR) reviewing the Client. At most one review per (project, fromOrgType, author) --
// enforced here rather than in the schema, since "one per org" vs "one per person" wasn't
// specified and blocking duplicate submissions per-author is the safer default.
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [project] = await db.select().from(prProjects).where(eq(prProjects.id, projectId));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.status !== "COMPLETED") {
    return NextResponse.json({ error: "Reviews can only be left once the project is COMPLETED" }, { status: 400 });
  }

  const memberships = await getPrMemberships(user.id);
  const isClientSide = clientOrgIds(memberships).includes(project.clientOrgId);
  let isVendorSide = false;
  if (!isClientSide) {
    const myVendorOrgIds = vendorOrgIds(memberships);
    if (myVendorOrgIds.length) {
      const [awardedBid] = await db
        .select()
        .from(prBids)
        .where(and(eq(prBids.prProjectId, projectId), eq(prBids.status, "ACCEPTED")));
      isVendorSide = !!awardedBid && myVendorOrgIds.includes(awardedBid.vendorOrgId);
    }
  }
  if (!isClientSide && !isVendorSide) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsedRating = Number(body.rating);
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return NextResponse.json({ error: "rating must be an integer 1-5" }, { status: 400 });
  }

  const fromOrgType = isClientSide ? "CLIENT" : "VENDOR";
  const [existing] = await db
    .select()
    .from(prReviews)
    .where(and(eq(prReviews.prProjectId, projectId), eq(prReviews.fromOrgType, fromOrgType), eq(prReviews.authorUserId, user.id)));
  if (existing) return NextResponse.json({ error: "You have already reviewed this project" }, { status: 409 });

  const [review] = await db
    .insert(prReviews)
    .values({
      prProjectId: projectId,
      fromOrgType,
      authorUserId: user.id,
      rating: parsedRating,
      comments: body.comments || null,
    })
    .returning();

  await logAudit({
    actor: user,
    action: "projectrequesta.review.submitted",
    entityType: "pr_review",
    entityId: review.id,
    prOrganizationId: project.clientOrgId,
    afterValue: JSON.stringify(review),
  });

  if (fromOrgType === "CLIENT") {
    const [awardedBid] = await db
      .select()
      .from(prBids)
      .where(and(eq(prBids.prProjectId, projectId), eq(prBids.status, "ACCEPTED")));
    if (awardedBid) {
      notifyPrOrg(
        awardedBid.vendorOrgId,
        `New review on "${project.title}"`,
        `The client left you a ${parsedRating}-star review on "${project.title}".`,
        ["VENDOR_ORG_ADMIN", "VENDOR_CONTRIBUTOR"]
      ).catch(() => {});
    }
  } else {
    notifyPrOrg(
      project.clientOrgId,
      `New review on "${project.title}"`,
      `The vendor left your organization a ${parsedRating}-star review on "${project.title}".`,
      ["CLIENT_ORG_ADMIN", "CLIENT_REQUESTER"]
    ).catch(() => {});
  }

  return NextResponse.json(review, { status: 201 });
}
