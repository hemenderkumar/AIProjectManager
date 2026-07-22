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
  TrendingUp,
  Compass,
  Globe2,
  Gavel,
} from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import LogoutButton from "./LogoutButton";
import ThemeSwitcher from "./ThemeSwitcher";

function NavLink({ href, icon, children, pathname }: { href: string; icon: React.ReactNode; children: React.ReactNode; pathname: string }) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? "bg-accent-50 text-accent-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent-600" />}
      {icon}
      {children}
    </Link>
  );
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      {children}
    </div>
  );
}

export default function Sidebar({
  user,
  open,
  isKeelConnectMember,
  isScPlatform,
}: {
  user: SessionUser | null;
  open?: boolean;
  isKeelConnectMember?: boolean;
  isScPlatform?: boolean;
}) {
  const isInternal = !!user && user.organizationId == null;
  const pathname = usePathname();
  // Two separate product tracks sharing one login: "Keel Deliver" (the original PM/delivery
  // tool -- everything under the routes below) and "KeelConnect" (the B2B marketplace,
  // everything under /keelconnect/*). Deliberately no direct switcher between the two --
  // /home is the only place that links into both, so each track's nav only ever shows that
  // track's own features. This doesn't gate access itself -- that's enforced server-side by
  // each track's own API routes.
  const onKeelConnect = pathname.startsWith("/keelconnect");

  return (
    <aside
      className={`w-64 md:w-60 shrink-0 border-r border-slate-200 bg-white h-screen flex flex-col
        fixed top-0 left-0 z-50 transition-transform duration-200
        md:sticky md:z-auto md:transition-none md:translate-x-0
        ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="px-5 py-5 border-b border-slate-100">
        <Link href="/home" className="flex items-center gap-2.5 group">
          <Image src="/keel-mark.svg" alt="Keel" width={32} height={32} />
          <div>
            <p className="text-sm font-semibold text-slate-900 leading-tight group-hover:text-accent-700">
              {onKeelConnect ? "KeelConnect" : "Keel"}
            </p>
            <p className="text-xs text-slate-400 leading-tight">
              {onKeelConnect ? "B2B outsourcing marketplace" : "Guiding project success"}
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {onKeelConnect ? (
          <>
            <NavLink href="/home" icon={<Home size={17} />} pathname={pathname}>Home</NavLink>
            <NavLink href="/keelconnect" icon={<Compass size={17} />} pathname={pathname}>KeelConnect Home</NavLink>
            <NavSection label="Marketplace">
              <NavLink href="/keelconnect/organizations" icon={<Building2 size={17} />} pathname={pathname}>Organizations</NavLink>
              <NavLink href="/keelconnect/projects" icon={<Globe2 size={17} />} pathname={pathname}>Projects</NavLink>
              <NavLink href="/keelconnect/vendors" icon={<Users size={17} />} pathname={pathname}>Vendor Directory</NavLink>
            </NavSection>
            <NavSection label="My Work">
              <NavLink href="/keelconnect/disputes" icon={<Gavel size={17} />} pathname={pathname}>Disputes</NavLink>
              <NavLink href="/keelconnect/mfa" icon={<ShieldCheck size={17} />} pathname={pathname}>Two-Factor Auth</NavLink>
            </NavSection>
            {isScPlatform && (
              <NavSection label="Platform">
                <NavLink href="/keelconnect/admin" icon={<ShieldCheck size={17} />} pathname={pathname}>Admin Console</NavLink>
              </NavSection>
            )}
            {!isKeelConnectMember && !isScPlatform && (
              <p className="px-3 pt-4 text-xs text-slate-400 leading-relaxed">
                You&apos;re not part of a KeelConnect organization yet. Create a Client or Vendor
                organization to start posting or bidding on projects.
              </p>
            )}
          </>
        ) : (
          <>
            <NavLink href="/home" icon={<Home size={17} />} pathname={pathname}>Home</NavLink>
            <NavLink href="/dashboard" icon={<LayoutDashboard size={17} />} pathname={pathname}>Dashboard</NavLink>
            <NavLink href="/how-it-works" icon={<Compass size={17} />} pathname={pathname}>How Keel Works</NavLink>

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
              {(user?.role === "SUPER_USER" || user?.role === "ADMIN") && (
                <NavLink href="/vendors" icon={<TrendingUp size={17} />} pathname={pathname}>Vendor Scorecard</NavLink>
              )}
            </NavSection>

            {user?.role === "ADMIN" && (
              // Its own clearly-labeled section, not buried inside "More" — this is where
              // inviting/managing users and companies (and approving registration requests)
              // actually lives, so it needs to be easy to find, not the last item in a list.
              <NavSection label="Account Management">
                <NavLink href="/admin" icon={<ShieldCheck size={17} />} pathname={pathname}>Users & Companies</NavLink>
              </NavSection>
            )}
          </>
        )}
      </nav>
      <div className="p-3 border-t border-slate-100 space-y-3">
        <ThemeSwitcher />
        {onKeelConnect ? (
          <Link
            href="/keelconnect/organizations"
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700"
          >
            <PlusCircle size={16} />
            Register Organization
          </Link>
        ) : (
          <Link
            href="/projects/new"
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700"
          >
            <PlusCircle size={16} />
            New Project
          </Link>
        )}
        <div className="flex items-center gap-2 px-1 text-xs text-slate-300">
          <Link href="/privacy" className="hover:text-slate-500">Privacy</Link>
          <span>·</span>
          <Link href="/terms" className="hover:text-slate-500">Terms</Link>
        </div>
        {user && (
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-xs font-medium text-slate-700">{user.name}</p>
              <p className="text-xs text-slate-400">{user.role}</p>
            </div>
            <LogoutButton />
          </div>
        )}
      </div>
    </aside>
  );
}
