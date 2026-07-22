import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { scProjects, scOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { Globe2, Users, ArrowRight, Search, ShieldCheck, KeyRound, ScrollText } from "lucide-react";

export const metadata: Metadata = {
  title: "KeelConnect Marketplace — Open Projects & Resource Requests | Keel",
  description:
    "Browse open outsourcing projects and staffing requests posted on the KeelConnect marketplace. No login required to browse — sign up to bid.",
};

// Logged-out, SEO-indexable marketplace landing (#256). A plain server component with
// server-rendered search (via searchParams + GET form, no client JS required) so every
// posting is crawlable and indexable, not hidden behind a client-side fetch. Only ever shows
// OPEN postings -- see /api/public/projects for the same rule enforced on the API side.
export default async function MarketplaceLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q = "", category = "" } = await searchParams;
  const user = await getCurrentUser();
  if (!user) await logActivity({ type: "PUBLIC_VISIT", path: "/marketplace" });

  const rows = await db
    .select({
      id: scProjects.id,
      title: scProjects.title,
      description: scProjects.description,
      category: scProjects.category,
      targetBudget: scProjects.targetBudget,
      currency: scProjects.currency,
      requestType: scProjects.requestType,
      rateType: scProjects.rateType,
      clientOrgName: scOrganizations.name,
    })
    .from(scProjects)
    .innerJoin(scOrganizations, eq(scProjects.clientOrgId, scOrganizations.id))
    .where(eq(scProjects.status, "OPEN"));

  const ql = q.trim().toLowerCase();
  const cl = category.trim().toLowerCase();
  const postings = rows.filter(
    (p) =>
      (!ql || p.title.toLowerCase().includes(ql) || (p.description ?? "").toLowerCase().includes(ql)) &&
      (!cl || (p.category ?? "").toLowerCase().includes(cl))
  );

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/keel-mark.svg" alt="Keel" width={24} height={24} />
            <span className="text-sm font-semibold text-slate-900">KeelConnect Marketplace</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium text-slate-500">
            <Link href="/marketplace/vendors" className="hover:text-slate-900 transition-colors">Vendors</Link>
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
        <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-2">Open marketplace</p>
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight mb-3">
          Outsourcing projects & resource requests, open for bids
        </h1>
        <p className="text-sm text-slate-600 max-w-2xl mb-6">
          Every posting below is open on KeelConnect right now. Browse freely — create a free Vendor
          account to submit a bid or offer a rate.
        </p>

        <div className="flex flex-wrap gap-x-6 gap-y-2 mb-8 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-600" /> KYC/KYB verified organizations</span>
          <span className="flex items-center gap-1.5"><KeyRound size={14} className="text-emerald-600" /> MFA-enforced Finance & Platform roles</span>
          <span className="flex items-center gap-1.5"><ScrollText size={14} className="text-emerald-600" /> Full audit trail on every engagement</span>
        </div>

        <form method="GET" className="flex flex-col sm:flex-row gap-2.5 mb-8">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search title or description"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
          <input
            name="category"
            defaultValue={category}
            placeholder="Category"
            className="sm:w-56 text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
          <button type="submit" className="flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors">
            <Search size={14} /> Search
          </button>
        </form>

        {postings.length === 0 ? (
          <p className="text-sm text-slate-400 py-12 text-center">No open postings match this search right now.</p>
        ) : (
          <div className="space-y-3">
            {postings.map((p) => (
              <Link
                key={p.id}
                href={`/marketplace/postings/${p.id}`}
                className="block p-4 rounded-xl border border-slate-200 hover:border-accent-300 hover:bg-accent-50/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {p.requestType === "RESOURCE_REQUEST" ? (
                        <Users size={14} className="text-slate-400 shrink-0" />
                      ) : (
                        <Globe2 size={14} className="text-slate-400 shrink-0" />
                      )}
                      <p className="text-sm font-semibold text-slate-900 truncate">{p.title}</p>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 max-w-2xl">{p.description ?? "No description provided."}</p>
                    <p className="text-xs text-slate-400 mt-1.5">
                      Posted by {p.clientOrgName} · {p.category ?? "Uncategorized"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {p.targetBudget != null && (
                      <p className="text-sm font-medium text-slate-700">
                        {p.currency} {p.targetBudget.toLocaleString()}
                        {p.requestType === "RESOURCE_REQUEST" && p.rateType ? `/${p.rateType.toLowerCase()}` : ""}
                      </p>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 mt-1">
                      View <ArrowRight size={12} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
