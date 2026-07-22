import Link from "next/link";
import Topbar from "@/components/Topbar";
import {
  Lightbulb,
  LifeBuoy,
  Rocket,
  LayoutDashboard,
  ArrowRight,
  Globe2,
  FolderKanban,
  FileBarChart,
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

        <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Keel Deliver lane */}
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 flex flex-col">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="h-9 w-9 rounded-lg bg-accent-50 flex items-center justify-center shrink-0">
                <Rocket size={18} className="text-accent-600" />
              </div>
              <p className="text-sm font-semibold text-slate-900">Keel Deliver</p>
            </div>
            <p className="text-xs text-slate-500 mb-1">Run your own team&apos;s delivery — plan, track, and report.</p>
            <p className="text-xs text-slate-400 mb-4">
              Ideation gates, AI-drafted charters, and a built-in RFP/SOW workflow — not just another
              task tracker.{" "}
              <Link href="/how-it-works" className="text-accent-600 hover:text-accent-700 font-medium">
                See how
              </Link>
            </p>

            <Link
              href="/dashboard"
              className="group flex items-center justify-between gap-3 bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700 rounded-lg px-4 py-3 mb-4"
            >
              <div className="flex items-center gap-3">
                <LayoutDashboard size={18} />
                <span className="text-sm font-semibold">Go to the Tracker</span>
              </div>
              <ArrowRight size={16} className="shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Quick start</p>
            <div className="space-y-1.5 mb-4">
              <QuickRow href="/ideation" icon={<Lightbulb size={15} />} label="New Ideation" hint="Brainstorm & feasibility" />
              <QuickRow href="/execution" icon={<Rocket size={15} />} label="New Project" hint="Skip straight to planning" />
              <QuickRow href="/support" icon={<LifeBuoy size={15} />} label="Project Support" hint="Incidents & ongoing cost" />
            </div>

            <div className="mt-auto pt-3 border-t border-slate-100 flex gap-2">
              <QuickLink href="/projects" label="All Projects" icon={<FolderKanban size={14} />} />
              {isInternal && <QuickLink href="/reports" label="Reports" icon={<FileBarChart size={14} />} />}
            </div>
          </div>

          {/* KeelConnect lane */}
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 flex flex-col">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Globe2 size={18} className="text-slate-700" />
              </div>
              <p className="text-sm font-semibold text-slate-900">KeelConnect</p>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              {isKeelConnectMember
                ? "The marketplace layer — your registered organizations, projects, and bids."
                : "The marketplace layer — post a project or bid on one as a Client or Vendor."}
            </p>

            <Link
              href="/keelconnect"
              className="group flex items-center justify-between gap-3 bg-slate-900 text-white shadow-sm shadow-slate-900/20 transition-colors hover:bg-slate-800 rounded-lg px-4 py-3 mb-4"
            >
              <div className="flex items-center gap-3">
                <Globe2 size={18} />
                <span className="text-sm font-semibold">{isKeelConnectMember ? "Go to KeelConnect" : "Register an organization"}</span>
              </div>
              <ArrowRight size={16} className="shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            {!isKeelConnectMember && (
              <p className="text-xs text-slate-400 mb-4">
                Takes under a minute — no separate account, just a Client or Vendor profile tied to your Keel login.
              </p>
            )}

            <div className="mt-auto pt-3 border-t border-slate-100 flex gap-2">
              <QuickLink href="/keelconnect/organizations" label="Organizations" icon={<Globe2 size={14} />} />
              <QuickLink href="/keelconnect/projects" label="Marketplace" icon={<FolderKanban size={14} />} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickRow({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-lg border border-slate-100 hover:border-accent-200 hover:bg-accent-50/40 transition-colors px-3 py-2"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-accent-600 shrink-0">{icon}</span>
        <span className="text-sm font-medium text-slate-800 truncate">{label}</span>
      </div>
      <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">{hint}</span>
    </Link>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-center"
    >
      {icon}
      {label}
    </Link>
  );
}
