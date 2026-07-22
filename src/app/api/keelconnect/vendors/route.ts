import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scOrganizations, scReviews, scProjects, scBids } from "@/lib/db/schema";
import { eq, and, avg, count } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

// Vendor discovery (#255): search/filter across every Vendor org on the marketplace, ranked
// by aggregate client rating. This is the "browse vendors" list a Client sees before ever
// posting a project -- deliberately open to any logged-in KeelConnect participant (not
// gated to Client roles only), since a Vendor should be able to see how they compare too.
//
// Rating aggregation: sc_reviews only links to sc_project_id, not directly to a vendor org,
// so a vendor's rating is "the average of every CLIENT-authored review on a project this
// vendor's org actually won" -- joined via the accepted (status=ACCEPTED) sc_bid for that
// project.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase() || "";
  const category = searchParams.get("category")?.trim().toLowerCase() || "";
  const skill = searchParams.get("skill")?.trim().toLowerCase() || "";
  const minPrice = searchParams.get("minPrice") ? Number(searchParams.get("minPrice")) : null;
  const maxPrice = searchParams.get("maxPrice") ? Number(searchParams.get("maxPrice")) : null;
  const minRating = searchParams.get("minRating") ? Number(searchParams.get("minRating")) : null;
  const verifiedOnly = searchParams.get("verifiedOnly") === "true";

  const vendors = await db
    .select()
    .from(scOrganizations)
    .where(and(eq(scOrganizations.orgType, "VENDOR"), eq(scOrganizations.isActive, true)));

  const ratingRows = await db
    .select({ vendorOrgId: scBids.vendorOrgId, avgRating: avg(scReviews.rating), reviewCount: count(scReviews.id) })
    .from(scReviews)
    .innerJoin(scProjects, eq(scReviews.scProjectId, scProjects.id))
    .innerJoin(scBids, and(eq(scBids.scProjectId, scProjects.id), eq(scBids.status, "ACCEPTED")))
    .where(eq(scReviews.fromOrgType, "CLIENT"))
    .groupBy(scBids.vendorOrgId);

  const ratingByOrg = new Map(ratingRows.map((r) => [r.vendorOrgId, { avgRating: Number(r.avgRating), reviewCount: Number(r.reviewCount) }]));

  const results = vendors
    .filter((v) => !verifiedOnly || v.verificationStatus === "VERIFIED")
    .filter((v) => !q || v.name.toLowerCase().includes(q) || (v.headline ?? "").toLowerCase().includes(q))
    .filter((v) => !category || (v.categories ?? []).some((c) => c.toLowerCase().includes(category)))
    .filter((v) => !skill || (v.skills ?? []).some((s) => s.toLowerCase().includes(skill)))
    .filter((v) => {
      if (minPrice == null && maxPrice == null) return true;
      // A vendor with no price band set is neither included nor excluded by a price filter --
      // treat "unset" as "hasn't told us yet" rather than assuming they're in or out of range.
      if (v.priceBandMin == null && v.priceBandMax == null) return false;
      if (maxPrice != null && v.priceBandMin != null && v.priceBandMin > maxPrice) return false;
      if (minPrice != null && v.priceBandMax != null && v.priceBandMax < minPrice) return false;
      return true;
    })
    .map((v) => ({ ...v, rating: ratingByOrg.get(v.id) ?? null }))
    .filter((v) => minRating == null || (v.rating?.avgRating ?? 0) >= minRating)
    .sort((a, b) => (b.rating?.avgRating ?? -1) - (a.rating?.avgRating ?? -1) || a.name.localeCompare(b.name));

  return NextResponse.json(results);
}
