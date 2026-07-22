import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { scOrganizations, scReviews, scProjects, scBids } from "@/lib/db/schema";
import { eq, and, isNotNull, avg, count } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { ShieldCheck, Star, Search } from "lucide-react";

export const metadata: Metadata = {
  title: "Vendor Directory — Verified Outsourcing Partners | KeelConnect",
  description:
    "Browse verified vendor organizations on the KeelConnect marketplace — portfolios, ratings, and price bands, no login required.",
};

export default async function PublicVendorDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; skill?: string }>;
}) {
  const { q = "", category = "", skill = "" } = await searchParams;
  const user = await getCurrentUser();
  if (!user) await logActivity({ type: "PUBLIC_VISIT", path: "/marketplace/vendors" });

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

  const ql = q.trim().toLowerCase();
  const cl = category.trim().toLowerCase();
  const sl = skill.trim().toLowerCase();
  const results = vendors
    .filter((v) => !ql || v.name.toLowerCase().includes(ql) || (v.headline ?? "").toLowerCase().includes(ql))
    .filter((v) => !cl || (v.categories ?? []).some((c) => c.toLowerCase().includes(cl)))
    .filter((v) => !sl || (v.skills ?? []).some((s) => s.toLowerCase().includes(sl)))
    .map((v) => ({ ...v, rating: ratingByOrg.get(v.id) ?? null }))
    .sort((a, b) => (b.rating?.avgRating ?? -1) - (a.rating?.avgRating ?? -1) || a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/marketplace" className="flex items-center gap-2.5">
            <Image src="/keel-mark.svg" alt="Keel" width={24} height={24} />
            <span className="text-sm font-semibold text-slate-900">KeelConnect Marketplace</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium text-slate-500">
            <Link href="/marketplace" className="hover:text-slate-900 transition-colors">Postings</Link>
            {user ? (
              <Link href="/keelconnect" className="px-3.5 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 transition-colors">
                Open KeelConnect
              </Link>
            ) : (
              <Link href="/register" className="px-3.5 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 transition-colors">
                Sign up
              </Link>
            )}
          </nav>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-12">
        <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-2">Vendor directory</p>
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight mb-3">
          Verified outsourcing partners on KeelConnect
        </h1>
        <p className="text-sm text-slate-600 max-w-2xl mb-8">
          Every vendor below has opted into a public profile. Ratings are computed from real client
          reviews left after a completed KeelConnect engagement.
        </p>

        <form method="GET" className="flex flex-col sm:flex-row gap-2.5 mb-8">
          <input name="q" defaultValue={q} placeholder="Search name or headline" className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent-500" />
          <input name="category" defaultValue={category} placeholder="Category" className="sm:w-48 text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent-500" />
          <input name="skill" defaultValue={skill} placeholder="Skill" className="sm:w-48 text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent-500" />
          <button type="submit" className="flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors">
            <Search size={14} /> Search
          </button>
        </form>

        {results.length === 0 ? (
          <p className="text-sm text-slate-400 py-12 text-center">No public vendor profiles match this search yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {results.map((v) => (
              <Link
                key={v.id}
                href={`/marketplace/vendors/${v.publicSlug}`}
                className="block p-4 rounded-xl border border-slate-200 hover:border-accent-300 hover:bg-accent-50/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-slate-900">{v.name}</p>
                  {v.verificationStatus === "VERIFIED" && (
                    <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                      <ShieldCheck size={11} /> Verified
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-2">{v.headline ?? "No headline set"}</p>
                {(v.categories?.length || v.skills?.length) ? (
                  <p className="text-xs text-slate-400 mb-2">{[...(v.categories ?? []), ...(v.skills ?? [])].slice(0, 4).join(" · ")}</p>
                ) : null}
                <div className="flex items-center justify-between">
                  {v.rating ? (
                    <p className="flex items-center gap-1 text-xs font-medium text-slate-700">
                      <Star size={12} className="text-amber-400 fill-amber-400" /> {v.rating.avgRating.toFixed(1)}
                      <span className="text-slate-400 font-normal">({v.rating.reviewCount})</span>
                    </p>
                  ) : (
                    <span />
                  )}
                  {(v.priceBandMin != null || v.priceBandMax != null) && (
                    <p className="text-xs text-slate-400">${v.priceBandMin ?? "?"}–${v.priceBandMax ?? "?"}/hr</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
