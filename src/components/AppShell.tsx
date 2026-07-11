"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import AvatarAssistant from "./AvatarAssistant";
import type { SessionUser } from "@/lib/auth";

// Wraps the whole authenticated app shell. On md+ screens this renders exactly like the
// old always-visible sidebar layout. Below md, the sidebar becomes an off-canvas drawer
// (hidden by default) opened via a hamburger button in a small fixed top bar, with a
// tap-to-dismiss backdrop — the standard mobile pattern for an app that otherwise assumes
// a permanent left nav.
export default function AppShell({ user, children }: { user: SessionUser | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
        <Image src="/keel-mark.svg" alt="Keel" width={22} height={22} />
        <p className="text-sm font-semibold text-slate-900">Keel</p>
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-slate-900/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar user={user} open={open} />

      <div className="flex-1 min-w-0 pt-14 md:pt-0">{children}</div>
      <AvatarAssistant />
    </div>
  );
}
