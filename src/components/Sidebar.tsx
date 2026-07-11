import Link from "next/link";
import Image from "next/image";
import {
  Home,
  LayoutDashboard,
  FolderKanban,
  Sparkles,
  PlusCircle,
  ShieldCheck,
  FileBarChart,
  Users,
  Lightbulb,
  Rocket,
  LifeBuoy,
  Building2,
  FileSearch,
} from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

const navLinkCls =
  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900";

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      {children}
    </div>
  );
}

export default function Sidebar({ user }: { user: SessionUser | null }) {
  const isInternal = !!user && user.organizationId == null;
  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <Image src="/keel-mark.svg" alt="Keel" width={32} height={32} />
          <div>
            <p className="text-sm font-semibold text-slate-900 leading-tight">Keel</p>
            <p className="text-xs text-slate-400 leading-tight">Guiding project success</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        <Link href="/home" className={navLinkCls}>
          <Home size={17} />
          Home
        </Link>
        <Link href="/dashboard" className={navLinkCls}>
          <LayoutDashboard size={17} />
          Dashboard
        </Link>

        <NavSection label="Project Lifecycle">
          <Link href="/ideation" className={navLinkCls}>
            <Lightbulb size={17} />
            Ideation
          </Link>
          <Link href="/execution" className={navLinkCls}>
            <Rocket size={17} />
            Project Execution
          </Link>
          <Link href="/support" className={navLinkCls}>
            <LifeBuoy size={17} />
            Ongoing Support
          </Link>
        </NavSection>

        <NavSection label="More">
          <Link href="/projects" className={navLinkCls}>
            <FolderKanban size={17} />
            All Projects
          </Link>
          <Link href="/ai" className={navLinkCls}>
            <Sparkles size={17} />
            AI Assistant
          </Link>
          {isInternal && (
            <Link href="/reports" className={navLinkCls}>
              <FileBarChart size={17} />
              Reports
            </Link>
          )}
          {isInternal && (
            <Link href="/resources" className={navLinkCls}>
              <Users size={17} />
              Resources
            </Link>
          )}
          {user?.role === "SUPER_USER" && (
            <Link href="/organization" className={navLinkCls}>
              <Building2 size={17} />
              My Organization
            </Link>
          )}
          {user?.role === "SUPER_USER" && (
            <Link href="/vendor-evaluation" className={navLinkCls}>
              <FileSearch size={17} />
              Vendor Evaluation
            </Link>
          )}
          {user?.role === "ADMIN" && (
            <Link href="/admin" className={navLinkCls}>
              <ShieldCheck size={17} />
              Admin
            </Link>
          )}
        </NavSection>
      </nav>
      <div className="p-3 border-t border-slate-100 space-y-3">
        <Link
          href="/projects/new"
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
        >
          <PlusCircle size={16} />
          New Project
        </Link>
        <div className="flex items-center gap-2 px-1 text-[10px] text-slate-300">
          <Link href="/privacy" className="hover:text-slate-500">Privacy</Link>
          <span>·</span>
          <Link href="/terms" className="hover:text-slate-500">Terms</Link>
        </div>
        {user && (
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-xs font-medium text-slate-700">{user.name}</p>
              <p className="text-[10px] text-slate-400">{user.role}</p>
            </div>
            <LogoutButton />
          </div>
        )}
      </div>
    </aside>
  );
}
