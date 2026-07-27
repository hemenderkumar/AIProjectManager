import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prOrganizations, prReviews, prProjects, prBids } from "@/lib/db/schema";
import { eq, and, avg, count } from "drizzle-orm";

// Public vendor profile (#256): portfolio, rating, verification badge -- no login required.
// Only returns a org that has actually claimed a publicSlug; a Vendor that hasn't opted in
// to a public profile 404s here even though it exists internally.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [org] = await db.select().from(prOrganizations).where(eq(prOrganizations.publicSlug, slug));
  if (!org || org.orgType !== "VENDOR") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [ratingRow] = await db
    .select({ avgRating: avg(prReviews.rating), reviewCount: count(prReviews.id) })
    .from(prReviews)
    .innerJoin(prProjects, eq(prReviews.prProjectId, prProjects.id))
    .innerJoin(prBids, and(eq(prBids.prProjectId, prProjects.id), eq(prBids.vendorOrgId, org.id), eq(prBids.status, "ACCEPTED")))
    .where(eq(prReviews.fromOrgType, "CLIENT"));

  const completedCount = await db
    .select({ id: prBids.id })
    .from(prBids)
    .innerJoin(prProjects, and(eq(prBids.prProjectId, prProjects.id), eq(prProjects.status, "COMPLETED")))
    .where(and(eq(prBids.vendorOrgId, org.id), eq(prBids.status, "ACCEPTED")));

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
    isDemoData: org.isDemoData,
    completedProjects: completedCount.length,
    rating:
      ratingRow && ratingRow.reviewCount > 0
        ? { avgRating: Number(ratingRow.avgRating), reviewCount: Number(ratingRow.reviewCount) }
        : null,
  });
}
