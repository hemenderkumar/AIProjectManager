import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { prProjects, prOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { Globe2, Users, ArrowRight, Search, ShieldCheck, KeyRound, ScrollText, FileText } from "lucide-react";
import { DemoBadge } from "@/components/projectrequesta/DemoBadge";

export const metadata: Metadata = {
  title: "ProjectRequesta — The Right Vendor, On Your Terms",
  description:
    "Post a project or a resource request, receive bids from KYC/KYB-verified vendor organizations, negotiate terms, and let the agreement and milestone payments run themselves. No login required to browse.",
};

// ProjectRequesta's own dedicated public homepage -- deliberately no Executa mentions, cards,
// or cross-links. Executa and ProjectRequesta are two independent products that happen to
// share a backend; each gets its own standalone pitch (see "/" for Executa's). The pitch
// sits above the existing logged-out, SEO-indexable marketplace listing (#256) so this page
// works as both the marketing homepage and the live browse surface -- a plain server
// component with server-rendered search (via searchParams + GET form, no client JS required)
// so every posting stays crawlable and indexable. Only ever shows OPEN postings -- see
// /api/public/projects for the same rule enforced on the API side.
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
      id: prProjects.id,
      title: prProjects.title,
      description: prProjects.description,
      category: prProjects.category,
      targetBudget: prProjects.targetBudget,
      currency: prProjects.currency,
      requestType: prProjects.requestType,
      rateType: prProjects.rateType,
      clientOrgName: prOrganizations.name,
      isDemoData: prProjects.isDemoData,
    })
    .from(prProjects)
    .innerJoin(prOrganizations, eq(prProjects.clientOrgId, prOrganizations.id))
    .where(eq(prProjects.status, "OPEN"));

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
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/marketplace" className="flex items-center gap-2.5">
            <Image src="/projectrequesta-mark.svg" alt="ProjectRequesta" width={24} height={24} />
            <span className="text-sm font-semibold text-slate-900">ProjectRequesta</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-500">
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How it works</a>
            <Link href="/marketplace/vendors" className="hover:text-slate-900 transition-colors">Vendors</Link>
            <a href="#postings" className="hover:text-slate-900 transition-colors">Open postings</a>
          </nav>
          {user ? (
            <Link
              href="/projectrequesta"
              className="text-sm font-medium px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700"
            >
              Open ProjectRequesta
            </Link>
          ) : (
            <Link
              href="/register"
              className="text-sm font-medium px-4 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700"
            >
              Sign up
            </Link>
          )}
        </div>
      </header>

      <section className="bg-gradient-to-b from-accent-50/70 via-slate-50/60 to-white pt-16 pb-16">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10 items-center">
          <div>
            <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-5">
              On your terms, the right vendor
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-slate-900 leading-tight tracking-tight mb-5">
              Post a project or a resource request. Receive bids. Negotiate. Get to work.
            </h1>
            <p className="text-base text-slate-600 mb-8 max-w-lg">
              ProjectRequesta is a sealed-bid B2B marketplace for outsourcing IT project and
              staffing work. Every organization is KYC/KYB-verified before it can transact, and
              accepting a bid automatically generates the agreement and manages milestone
              payments — no separate procurement tool required.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={user ? "/projectrequesta" : "/register"}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 transition-colors"
              >
                Post a project <ArrowRight size={14} />
              </Link>
              <a
                href="#postings"
                className="inline-flex items-center text-sm font-medium px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors"
              >
                Browse open postings
              </a>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/60 p-6">
            <p className="text-sm font-semibold text-slate-900 mb-4">Every engagement, verified end to end</p>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-2.5">
                <ShieldCheck size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                KYC/KYB verified organizations, sanctions screening and tax forms on file
              </li>
              <li className="flex items-start gap-2.5">
                <KeyRound size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                MFA enforced for Finance Approvers and every Platform role
              </li>
              <li className="flex items-start gap-2.5">
                <ScrollText size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                Full audit trail on every negotiation, agreement, and payment
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-16 scroll-mt-16">
        <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-2">How ProjectRequesta works</p>
        <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-10">From a posted request to a paid milestone, in four steps.</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Step number="01" title="Post" description="A Client posts a project or resource request with a target budget — open to everyone, or restricted by country." />
          <Step number="02" title="Bid" description="Verified Vendor organizations submit a bid or a rate offer. Either side can counter until terms are agreed." />
          <Step number="03" title="Agree" description="Accepting a bid automatically generates the right agreement for the engagement, with milestones attached." />
          <Step number="04" title="Get paid" description="Milestone payments are held and released against agreed terms, with a full audit trail throughout." />
        </div>
      </section>

      <section className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-2">What you get</p>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-10">Built for teams whose procurement and audit functions won&apos;t sign off without it.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
            <div>
              <FeatureRow
                icon={<Globe2 size={16} />}
                title="A sealed bidding marketplace"
                description="Post a project as open or restricted to certain countries, and let vetted Vendor organizations submit and negotiate bids privately."
              />
              <FeatureRow
                icon={<ShieldCheck size={16} />}
                title="KYC/KYB compliance, built in"
                description="Every organization is verified before it can transact — KYC, KYB, sanctions screening, and tax forms, reviewed by our compliance team."
              />
            </div>
            <div>
              <FeatureRow
                icon={<FileText size={16} />}
                title="Agreements generated automatically"
                description="Accepting a bid generates the right contract for the engagement — a single Client-Vendor agreement, or a mediated agreement on both sides."
              />
              <FeatureRow
                icon={<KeyRound size={16} />}
                title="Enterprise SSO and MFA"
                description="SAML single sign-on for enterprise Client organizations, with two-factor authentication enforced for Finance Approvers and platform staff."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="text-xs font-medium tracking-widest uppercase text-accent-300 mb-2">Built for regulated industries</p>
          <h2 className="text-xl font-semibold tracking-tight mb-4 max-w-2xl">
            The compliance depth other marketplaces skip is exactly what finance, healthcare, and
            government-adjacent teams require before they&apos;ll touch outsourced work at all.
          </h2>
          <p className="text-sm text-slate-300 max-w-2xl mb-10">
            Most marketplaces are built for speed, not scrutiny. ProjectRequesta is built for teams
            whose procurement, security, and audit functions won&apos;t sign off without it.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <p className="text-sm font-semibold mb-1.5">KYC/KYB on every organization</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every Client and Vendor is verified — identity, business, sanctions screening, and tax
                forms — before either side can transact. Nothing self-declared.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold mb-1.5">MFA enforced where it matters</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Two-factor authentication is required, not optional, for Finance Approvers and every
                Platform role — the roles that can move money or override a decision.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold mb-1.5">Role-scoped access, full audit trail</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Org Admin, Requester, Finance Approver, and Vendor roles are each scoped to exactly what
                they need — with every material action logged for your own compliance review.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="postings" className="max-w-5xl mx-auto px-6 py-16 scroll-mt-16">
        <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-2">Open marketplace</p>
        <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-3">
          Outsourcing projects & resource requests, open for bids
        </h2>
        <p className="text-sm text-slate-600 max-w-2xl mb-6">
          Every posting below is open right now. Browse freely — create a free Vendor account to
          submit a bid or offer a rate.
        </p>

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
                      {p.isDemoData && <DemoBadge />}
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

      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-slate-400">
          <span>© {new Date().getFullYear()} ProjectRequesta</span>
          <div className="flex items-center gap-3">
            <Link href="/privacy" className="hover:text-slate-600">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-600">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureRow({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="border-t border-slate-200 py-6 pr-8">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-accent-600">{icon}</span>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
      </div>
      <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="border-t border-slate-200 pt-5 pr-6">
      <p className="text-xs font-semibold text-accent-300 mb-2">{number}</p>
      <p className="text-sm font-semibold text-slate-900 mb-1.5">{title}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}
