import Link from "next/link";
import { Lock } from "lucide-react";

// Shown in place of a whole page when the current org's plan doesn't include this module (see
// lib/modules.ts). Deliberately the same visual language as AppShell's billing paywall card --
// both are "this account can't be here right now, here's why and what to do" states.
export default function ModuleLocked({ moduleName }: { moduleName: string }) {
  return (
    <div className="flex items-center justify-center min-h-[70vh] p-8">
      <div className="max-w-sm w-full bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6 text-center">
        <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center mx-auto mb-3">
          <Lock size={18} className="text-amber-600" />
        </div>
        <p className="text-sm font-semibold text-slate-900 mb-1.5">{moduleName} isn&apos;t on your plan</p>
        <p className="text-xs text-slate-500 mb-4">
          This feature isn&apos;t included in your organization&apos;s current plan. Upgrade to unlock it.
        </p>
        <Link
          href="/billing"
          className="inline-block w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 transition-colors"
        >
          View plans
        </Link>
      </div>
    </div>
  );
}
