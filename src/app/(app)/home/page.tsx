import Link from "next/link";
import Topbar from "@/components/Topbar";
import {
  Lightbulb,
  LifeBuoy,
  Rocket,
  LayoutDashboard,
  ArrowRight,
  Sparkles,
  FileSearch,
  FileBarChart,
  Globe2,
  ShieldCheck,
  FileText,
  KeyRound,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getScMemberships } from "@/lib/keelconnect/access";
import MyRateCard from "@/components/MyRateCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  const isInternal = !!user && user.organizationId == null;
  const isKeelConnectMember = user ? (await getScMemberships(user.id)).length > 0 : false;

  return (
    <div>
      <Topbar title={`Welcome${user ? `, ${user.name.split(" ")[0]}` : ""}`} subtitle="What are you working on today?" />
      <div className="p-8">
        <MyRateCard />
        <div className="max-w-5xl bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 mb-6">
          <p className="text-xs font-semibold tracking-wide uppercase text-accent-600 mb-1.5">What Keel Deliver does</p>
          <p className="text-sm text-slate-600 mb-4">
            Keel Deliver is your AI-driven project and portfolio tracker: it plans work, drafts charters and RFPs,
            watches budgets and risk, and turns your whole portfolio into board-ready reports.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <AboutChip icon={<Rocket size={16} />} label="Full project lifecycle" />
            <AboutChip icon={<Sparkles size={16} />} label="An AI project manager" />
            <AboutChip icon={<FileSearch size={16} />} label="Vendor evaluation" />
            <AboutChip icon={<FileBarChart size={16} />} label="Board-ready reports" />
          </div>
          <p className="text-xs font-semibold tracking-wide uppercase text-accent-600 mb-1.5 pt-4 border-t border-slate-100">What KeelConnect does</p>
          <p className="text-sm text-slate-600 mb-4">
            KeelConnect is the B2B marketplace layer: post a project, receive bids from vetted Vendor
            organizations, and let Keel generate the agreement and manage milestone payments.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <AboutChip icon={<Globe2 size={16} />} label="Sealed bidding marketplace" />
            <AboutChip icon={<ShieldCheck size={16} />} label="KYC/KYB compliance" />
            <AboutChip icon={<FileText size={16} />} label="Auto-generated agreements" />
            <AboutChip icon={<KeyRound size={16} />} label="Enterprise SSO + MFA" />
          </div>
        </div>

        <div className="max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Link
            href="/dashboard"
            className="group flex items-center justify-between gap-4 bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700 rounded-xl px-6 py-5"
          >
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <LayoutDashboard size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold">Go to the Tracker</p>
                <p className="text-xs text-accent-100">Portfolio dashboard — status, budgets, and risk across every project.</p>
              </div>
            </div>
            <ArrowRight size={18} className="shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <Link
            href="/keelconnect"
            className="group flex items-center justify-between gap-4 bg-slate-900 text-white shadow-sm shadow-slate-900/20 transition-colors hover:bg-slate-800 rounded-xl px-6 py-5"
          >
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <Globe2 size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold">{isKeelConnectMember ? "Go to KeelConnect" : "Explore KeelConnect"}</p>
                <p className="text-xs text-slate-300">
                  {isKeelConnectMember
                    ? "Browse projects, manage bids, and track your organizations."
                    : "Register a Client or Vendor organization to post or bid on work."}
                </p>
              </div>
            </div>
            <ArrowRight size={18} className="shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3 max-w-5xl">Or start something new</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl">
          <ChoiceCard
            href="/ideation"
            icon={<Lightbulb size={22} className="text-accent-600" />}
            title="New Ideation"
            description="Brainstorm a new opportunity or a problem that needs solving, run a feasibility check, and build the case before it becomes a project."
            cta="Start ideating"
          />
          <ChoiceCard
            href="/execution"
            icon={<Rocket size={22} className="text-accent-600" />}
            title="New Project"
            description="Skip ideation and kick off a new project directly — the AI planner is ready as soon as it's created."
            cta="Start a project"
          />
          <ChoiceCard
            href="/support"
            icon={<LifeBuoy size={22} className="text-accent-600" />}
            title="Project Support"
            description="Log or triage an incident on a live project, or estimate what ongoing support should cost."
            cta="Go to Ongoing Support"
          />
        </div>

        <div className="mt-8 max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-3">
          <QuickLink href="/projects" label="All Projects" />
          {isInternal && <QuickLink href="/reports" label="Reports" />}
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({
  href,
  icon,
  title,
  description,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 hover:border-accent-300 hover:shadow-sm transition-all flex flex-col"
    >
      <div className="h-10 w-10 rounded-lg bg-accent-50 flex items-center justify-center mb-3">{icon}</div>
      <p className="text-sm font-semibold text-slate-900 mb-1.5">{title}</p>
      <p className="text-xs text-slate-500 leading-relaxed flex-1">{description}</p>
      <p className="text-xs font-medium text-accent-600 mt-3 group-hover:underline">{cta} →</p>
    </Link>
  );
}

function AboutChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-2">
      <span className="text-accent-600 shrink-0">{icon}</span>
      {label}
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-xs px-3 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-center"
    >
      {label}
    </Link>
  );
}
