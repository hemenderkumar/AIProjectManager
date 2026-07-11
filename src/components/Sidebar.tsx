"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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

function NavLink({ href, icon, children, pathname }: { href: string; icon: React.ReactNode; children: React.ReactNode; pathname: string }) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-indigo-600" />}
      {icon}
      {children}
    </Link>
  );
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      {children}
    </div>
  );
}

export default function Sidebar({ user, open }: { user: SessionUser | null; open?: boolean }) {
  const isInternal = !!user && user.organizationId == null;
  const pathname = usePathname();
  return (
    <aside
      className={`w-64 md:w-60 shrink-0 border-r border-slate-200 bg-white h-screen flex flex-col
        fixed top-0 left-0 z-50 transition-transform duration-200
        md:sticky md:z-auto md:transition-none md:translate-x-0
        ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
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
        <NavLink href="/home" icon={<Home size={17} />} pathname={pathname}>Home</NavLink>
        <NavLink href="/dashboard" icon={<LayoutDashboard size={17} />} pathname={pathname}>Dashboard</NavLink>

        <NavSection label="Project Lifecycle">
          <NavLink href="/ideation" icon={<Lightbulb size={17} />} pathname={pathname}>Ideation</NavLink>
          <NavLink href="/execution" icon={<Rocket size={17} />} pathname={pathname}>Project Execution</NavLink>
          <NavLink href="/support" icon={<LifeBuoy size={17} />} pathname={pathname}>Ongoing Support</NavLink>
        </NavSection>

        <NavSection label="More">
          <NavLink href="/projects" icon={<FolderKanban size={17} />} pathname={pathname}>All Projects</NavLink>
          <NavLink href="/ai" icon={<Sparkles size={17} />} pathname={pathname}>AI Assistant</NavLink>
          {isInternal && (
            <NavLink href="/reports" icon={<FileBarChart size={17} />} pathname={pathname}>Reports</NavLink>
          )}
          {isInternal && (
            <NavLink href="/resources" icon={<Users size={17} />} pathname={pathname}>Resources</NavLink>
          )}
          {user?.role === "SUPER_USER" && (
            <NavLink href="/organization" icon={<Building2 size={17} />} pathname={pathname}>My Organization</NavLink>
          )}
          {(user?.role === "SUPER_USER" || user?.role === "ADMIN") && (
            <NavLink href="/vendor-evaluation" icon={<FileSearch size={17} />} pathname={pathname}>Vendor Evaluation</NavLink>
          )}
          {user?.role === "ADMIN" && (
            <NavLink href="/admin" icon={<ShieldCheck size={17} />} pathname={pathname}>Admin</NavLink>
          )}
        </NavSection>
      </nav>
      <div className="p-3 border-t border-slate-100 space-y-3">
        <Link
          href="/projects/new"
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
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
