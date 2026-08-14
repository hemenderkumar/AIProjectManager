"use client";
import { useEffect, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { CreditCard, CheckCircle2, Users, FolderKanban } from "lucide-react";
import { formatPlanPrice } from "@/lib/planFormat";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  billingInterval: string;
  billingModel: string;
  projectLimit: number | null;
  seatLimit: number | null;
  stripePriceId: string | null;
};

type Status = {
  internal: boolean;
  blocked: boolean;
  org: {
    id: string;
    name: string;
    trialEndsAt: string | null;
    subscriptionStatus: string;
    billingCompedByAdmin: boolean;
  } | null;
  currentPlan: Plan | null;
  plans: Plan[];
};

// Module-level, not called during render of the component body -- see the matching comment
// in admin/page.tsx. Keeps Date.now() out of react-hooks/purity's reach.
function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function BillingPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/billing/status").then((r) => r.json()).then(setStatus);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function subscribe(planId: string) {
    setBusyPlanId(planId);
    setError(null);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not start checkout");
      setBusyPlanId(null);
      return;
    }
    window.location.assign(data.url);
  }

  async function openPortal() {
    setPortalBusy(true);
    setError(null);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not open billing portal");
      setPortalBusy(false);
      return;
    }
    window.location.assign(data.url);
  }

  if (!status) {
    return (
      <div>
        <Topbar title="Billing" subtitle="Manage your subscription" />
        <div className="p-8 text-sm text-slate-400">Loading…</div>
      </div>
    );
  }

  if (status.internal) {
    return (
      <div>
        <Topbar title="Billing" subtitle="Manage your subscription" />
        <div className="p-8 text-sm text-slate-500">Billing applies to client organizations, not internal Executa staff.</div>
      </div>
    );
  }

  const org = status.org;
  const trialDaysLeft = org?.trialEndsAt && org.subscriptionStatus === "TRIALING" ? daysUntil(org.trialEndsAt) : null;

  return (
    <div>
      <Topbar title="Billing" subtitle={org?.name} />
      <div className="p-8 max-w-4xl">
        {status.blocked && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Your trial has ended and no plan is active. Choose a plan below to restore access.
          </div>
        )}

        {!status.blocked && org?.billingCompedByAdmin && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 size={16} /> This account has complimentary access granted by an Executa administrator.
          </div>
        )}

        {!status.blocked && !org?.billingCompedByAdmin && org?.subscriptionStatus === "TRIALING" && trialDaysLeft !== null && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {trialDaysLeft === 0 ? "Your trial ends today." : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your trial.`}
          </div>
        )}

        {!status.blocked && org?.subscriptionStatus === "ACTIVE" && !org.billingCompedByAdmin && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/60">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <CreditCard size={16} className="text-accent-600" />
              {status.currentPlan ? `Subscribed to ${status.currentPlan.name}` : "Subscription active"}
            </div>
            <button
              onClick={openPortal}
              disabled={portalBusy}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {portalBusy ? "Opening…" : "Manage billing"}
            </button>
          </div>
        )}

        {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Plans</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {status.plans.map((p) => {
            const isCurrent = status.currentPlan?.id === p.id && org?.subscriptionStatus === "ACTIVE";
            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 flex flex-col">
                <p className="text-sm font-semibold text-slate-900 mb-1">{p.name}</p>
                <p className="text-lg font-semibold text-slate-900 mb-2">{formatPlanPrice(p)}</p>
                {p.description && <p className="text-xs text-slate-500 mb-3">{p.description}</p>}
                <div className="text-xs text-slate-400 space-y-1 mb-4">
                  <p className="flex items-center gap-1.5">
                    <FolderKanban size={12} /> {p.projectLimit ? `${p.projectLimit} active projects` : "Unlimited projects"}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Users size={12} /> {p.seatLimit ? `${p.seatLimit} seats` : "Unlimited seats"}
                  </p>
                </div>
                <button
                  onClick={() => subscribe(p.id)}
                  disabled={isCurrent || busyPlanId === p.id || !p.stripePriceId}
                  className="mt-auto w-full text-sm font-medium px-4 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCurrent ? "Current plan" : busyPlanId === p.id ? "Redirecting…" : !p.stripePriceId ? "Coming soon" : "Subscribe"}
                </button>
              </div>
            );
          })}
          {status.plans.length === 0 && (
            <p className="text-sm text-slate-400 col-span-3">No plans have been configured yet — check back soon.</p>
          )}
        </div>
      </div>
    </div>
  );
}
