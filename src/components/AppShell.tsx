"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Menu, Lock } from "lucide-react";
import Sidebar from "./Sidebar";
import AvatarAssistant from "./AvatarAssistant";
import IssueReporter from "./IssueReporter";
import GlobalSearch from "./GlobalSearch";
import type { SessionUser } from "@/lib/auth";

// Wraps the whole authenticated app shell. On md+ screens this renders exactly like the
// old always-visible sidebar layout. Below md, the sidebar becomes an off-canvas drawer
// (hidden by default) opened via a hamburger button in a small fixed top bar, with a
// tap-to-dismiss backdrop — the standard mobile pattern for an app that otherwise assumes
// a permanent left nav.
export default function AppShell({
  user,
  billingBlocked,
  children,
}: {
  user: SessionUser | null;
  billingBlocked?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Hard lock ("trial expired, no active plan") but the /billing page itself must stay
  // reachable -- otherwise nobody could ever get to the "Subscribe" button that unblocks
  // them. billingBlocked is computed server-side in (app)/layout.tsx (Node runtime, has DB
  // access) and passed down; this is the one place that decides whether to actually enforce
  // it, since only a client component has the current pathname to check against.
  const showPaywall = !!billingBlocked && pathname !== "/billing";

  // Any navigation (tapping a nav link, creating a project, logging out) changes the
  // route — close the drawer then so it doesn't stay open over the new page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <div className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-white border-b border-slate-200 flex items-center gap-2.5 px-4">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-1.5 -ml-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
        >
          <Menu size={22} />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Image src="/executa-mark.svg" alt="Executa" width={28} height={28} />
          <p className="text-sm font-semibold text-slate-900">Executa</p>
        </Link>
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-slate-900/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar user={user} open={open} />

      <div className="flex-1 min-w-0 pt-14 md:pt-0">
        {showPaywall ? (
          <div className="flex items-center justify-center min-h-[70vh] p-8">
            <div className="max-w-sm w-full bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6 text-center">
              <div className="h-10 w-10 rounded-lg bg-rose-50 flex items-center justify-center mx-auto mb-3">
                <Lock size={18} className="text-rose-600" />
              </div>
              <p className="text-sm font-semibold text-slate-900 mb-1.5">Trial ended</p>
              <p className="text-xs text-slate-500 mb-4">
                Your free trial has ended and there&apos;s no active plan on this account. Choose a plan to restore access.
              </p>
              <Link
                href="/billing"
                className="inline-block w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 transition-colors"
              >
                View plans
              </Link>
            </div>
          </div>
        ) : (
          children
        )}
      </div>
      <AvatarAssistant />
      <IssueReporter />
      {user && <GlobalSearch />}
    </div>
  );
}
