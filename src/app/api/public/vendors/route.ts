import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scOrganizations, scReviews, scProjects, scBids } from "@/lib/db/schema";
import { eq, and, avg, count, isNotNull } from "drizzle-orm";

// Logged-out, SEO-indexable vendor search (#256) -- the public counterpart to
// /api/keelconnect/vendors (#255). Deliberately narrower on two axes: (1) only vendors that
// have claimed a publicSlug are returned (an org can be a full KeelConnect participant
// without ever opting into a public listing), and (2) the response shape is a hand-picked
// public-safe subset -- no taxId, no SSO/SAML config, no internal id-only fields beyond what
// the public profile page itself needs to link to (the slug, not the id).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase() || "";
  const category = searchParams.get("category")?.trim().toLowerCase() || "";
  const skill = searchParams.get("skill")?.trim().toLowerCase() || "";

  const vendors = await db
    .select()
    .from(scOrganizations)
    .where(and(eq(scOrganizations.orgType, "VENDOR"), isNotNull(scOrganizations.publicSlug)));

  const ratingRows = await db
    .select({ vendorOrgId: scBids.vendorOrgId, avgRating: avg(scReviews.rating), reviewCount: count(scReviews.id) })
    .from(scReviews)
    .innerJoin(scProjects, eq(scReviews.scProjectId, scProjects.id))
    .innerJoin(scBids, and(eq(scBids.scProjectId, scProjects.id), eq(scBids.status, "ACCEPTED")))
    .where(eq(scReviews.fromOrgType, "CLIENT"))
    .groupBy(scBids.vendorOrgId);
  const ratingByOrg = new Map(ratingRows.map((r) => [r.vendorOrgId, { avgRating: Number(r.avgRating), reviewCount: Number(r.reviewCount) }]));

  const results = vendors
    .filter((v) => !q || v.name.toLowerCase().includes(q) || (v.headline ?? "").toLowerCase().includes(q))
    .filter((v) => !category || (v.categories ?? []).some((c) => c.toLowerCase().includes(category)))
    .filter((v) => !skill || (v.skills ?? []).some((s) => s.toLowerCase().includes(skill)))
    .map((v) => ({
      slug: v.publicSlug,
      name: v.name,
      headline: v.headline,
      categories: v.categories,
      skills: v.skills,
      priceBandMin: v.priceBandMin,
      priceBandMax: v.priceBandMax,
      primaryCountry: v.primaryCountry,
      logoUrl: v.logoUrl,
      verified: v.verificationStatus === "VERIFIED",
      rating: ratingByOrg.get(v.id) ?? null,
    }))
    .sort((a, b) => (b.rating?.avgRating ?? -1) - (a.rating?.avgRating ?? -1) || a.name.localeCompare(b.name));

  return NextResponse.json(results);
}
