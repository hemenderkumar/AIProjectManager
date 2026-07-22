import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scOrganizations, scReviews, scProjects, scBids } from "@/lib/db/schema";
import { eq, and, avg, count } from "drizzle-orm";

// Public vendor profile (#256): portfolio, rating, verification badge -- no login required.
// Only returns a org that has actually claimed a publicSlug; a Vendor that hasn't opted in
// to a public profile 404s here even though it exists internally.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [org] = await db.select().from(scOrganizations).where(eq(scOrganizations.publicSlug, slug));
  if (!org || org.orgType !== "VENDOR") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [ratingRow] = await db
    .select({ avgRating: avg(scReviews.rating), reviewCount: count(scReviews.id) })
    .from(scReviews)
    .innerJoin(scProjects, eq(scReviews.scProjectId, scProjects.id))
    .innerJoin(scBids, and(eq(scBids.scProjectId, scProjects.id), eq(scBids.vendorOrgId, org.id), eq(scBids.status, "ACCEPTED")))
    .where(eq(scReviews.fromOrgType, "CLIENT"));

  const completedCount = await db
    .select({ id: scBids.id })
    .from(scBids)
    .innerJoin(scProjects, and(eq(scBids.scProjectId, scProjects.id), eq(scProjects.status, "COMPLETED")))
    .where(and(eq(scBids.vendorOrgId, org.id), eq(scBids.status, "ACCEPTED")));

  return NextResponse.json({
    name: org.name,
    headline: org.headline,
    companyProfile: org.companyProfile,
    categories: org.categories,
    skills: org.skills,
    priceBandMin: org.priceBandMin,
    priceBandMax: org.priceBandMax,
    primaryCountry: org.primaryCountry,
    portfolioUrl: org.portfolioUrl,
    logoUrl: org.logoUrl,
    verified: org.verificationStatus === "VERIFIED",
    completedProjects: completedCount.length,
    rating:
      ratingRow && ratingRow.reviewCount > 0
        ? { avgRating: Number(ratingRow.avgRating), reviewCount: Number(ratingRow.reviewCount) }
        : null,
  });
}
