import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { scOrganizations, scReviews, scProjects, scBids } from "@/lib/db/schema";
import { eq, and, avg, count } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { ShieldCheck, Star, ExternalLink, MapPin } from "lucide-react";

async function loadVendor(slug: string) {
  const [org] = await db.select().from(scOrganizations).where(eq(scOrganizations.publicSlug, slug));
  if (!org || org.orgType !== "VENDOR") return null;

  const [ratingRow] = await db
    .select({ avgRating: avg(scReviews.rating), reviewCount: count(scReviews.id) })
    .from(scReviews)
    .innerJoin(scProjects, eq(scReviews.scProjectId, scProjects.id))
    .innerJoin(scBids, and(eq(scBids.scProjectId, scProjects.id), eq(scBids.vendorOrgId, org.id), eq(scBids.status, "ACCEPTED")))
    .where(eq(scReviews.fromOrgType, "CLIENT"));

  const completed = await db
    .select({ id: scBids.id })
    .from(scBids)
    .innerJoin(scProjects, and(eq(scBids.scProjectId, scProjects.id), eq(scProjects.status, "COMPLETED")))
    .where(and(eq(scBids.vendorOrgId, org.id), eq(scBids.status, "ACCEPTED")));

  return {
    org,
    completedCount: completed.length,
    rating: ratingRow && ratingRow.reviewCount > 0 ? { avgRating: Number(ratingRow.avgRating), reviewCount: Number(ratingRow.reviewCount) } : null,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadVendor(slug);
  if (!data) return { title: "Vendor not found | KeelConnect" };
  return {
    title: `${data.org.name} — Vendor Profile | KeelConnect`,
    description: data.org.headline || `${data.org.name} is a vendor organization on the KeelConnect marketplace.`,
  };
}

export default async function PublicVendorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadVendor(slug);
  if (!data) notFound();
  const { org, rating, completedCount } = data;

  const user = await getCurrentUser();
  if (!user) await logActivity({ type: "PUBLIC_VISIT", path: `/marketplace/vendors/${slug}` });

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/marketplace" className="flex items-center gap-2.5">
            <Image src="/keel-mark.svg" alt="Keel" width={24} height={24} />
            <span className="text-sm font-semibold text-slate-900">KeelConnect Marketplace</span>
          </Link>
          <Link href="/marketplace/vendors" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
            Vendor Directory
          </Link>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-start gap-4 mb-6">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt={org.name} className="h-14 w-14 rounded-xl object-cover border border-slate-200" />
          ) : (
            <div className="h-14 w-14 rounded-xl bg-accent-50 flex items-center justify-center text-accent-600 font-semibold text-lg shrink-0">
              {org.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{org.name}</h1>
              {org.verificationStatus === "VERIFIED" && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                  <ShieldCheck size={12} /> Verified
                </span>
              )}
            </div>
            {org.headline && <p className="text-sm text-slate-600 mt-1">{org.headline}</p>}
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
              {org.primaryCountry && (
                <span className="flex items-center gap-1"><MapPin size={12} /> {org.primaryCountry}</span>
              )}
              {rating && (
                <span className="flex items-center gap-1 font-medium text-slate-600">
                  <Star size={12} className="text-amber-400 fill-amber-400" /> {rating.avgRating.toFixed(1)} ({rating.reviewCount} reviews)
                </span>
              )}
              {completedCount > 0 && <span>{completedCount} completed engagement{completedCount === 1 ? "" : "s"}</span>}
            </div>
          </div>
        </div>

        {org.companyProfile && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-slate-900 mb-2">About</p>
            <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">{org.companyProfile}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          {org.categories && org.categories.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-900 mb-2">Categories</p>
              <div className="flex flex-wrap gap-1.5">
                {org.categories.map((c) => (
                  <span key={c} className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">{c}</span>
                ))}
              </div>
            </div>
          )}
          {org.skills && org.skills.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-900 mb-2">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {org.skills.map((s) => (
                  <span key={s} className="text-xs px-2 py-1 rounded-full bg-accent-50 text-accent-700">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-6 text-sm mb-8">
          {(org.priceBandMin != null || org.priceBandMax != null) && (
            <p className="text-slate-700">
              <span className="font-semibold">${org.priceBandMin ?? "?"}–${org.priceBandMax ?? "?"}/hr</span>
              <span className="text-slate-400"> typical rate band</span>
            </p>
          )}
          {org.portfolioUrl && (
            <a href={org.portfolioUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent-600 hover:text-accent-700 font-medium">
              Portfolio <ExternalLink size={13} />
            </a>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-1">Want to hire {org.name}?</p>
          <p className="text-xs text-slate-500 mb-3">
            Post a project or resource request on KeelConnect, and invite this vendor — or let the open
            marketplace bring their bid to you.
          </p>
          <Link
            href={user ? "/keelconnect/projects" : "/register"}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 transition-colors"
          >
            {user ? "Post a project" : "Sign up to post a project"}
          </Link>
        </div>
      </section>
    </div>
  );
}
