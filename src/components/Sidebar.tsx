import Link from "next/link";
import { LayoutDashboard, FolderKanban, Sparkles, PlusCircle, ShieldCheck, FileBarChart } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

export default function Sidebar({ user }: { user: SessionUser | null }) {
  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            KP
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 leading-tight">KPI Project Tracker</p>
            <p className="text-xs text-slate-400 leading-tight">AI-driven PMO</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <LayoutDashboard size={17} />
          Dashboard
        </Link>
        <Link
          href="/projects"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <FolderKanban size={17} />
          Projects
        </Link>
        <Link
          href="/ai"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <Sparkles size={17} />
          AI Assistant
        </Link>
        <Link
          href="/reports"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <FileBarChart size={17} />
          Reports
        </Link>
        {user?.role === "ADMIN" && (
          <Link
            href="/admin"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ShieldCheck size={17} />
            Admin
          </Link>
        )}
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
