"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import { Loader2, Sparkles, TrendingUp } from "lucide-react";

type VendorScorecard = {
  vendorName: string;
  sowCount: number;
  totalFunding: number;
  statusBreakdown: Record<string, number>;
  testCasesTotal: number;
  testCasesPassed: number;
  testPassRate: number | null;
  projects: string[];
};

type OrgOption = { id: string; name: string };
type SessionUser = { id: string; name: string; role: string; organizationId: string | null };
type VendorInsights = { summary: string; standouts: string[] };

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function VendorsPage() {
  return (
    <Suspense fallback={null}>
      <VendorsInner />
    </Suspense>
  );
}

function VendorsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState(searchParams.get("org") ?? "");

  const [scorecards, setScorecards] = useState<VendorScorecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<VendorInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const isAdmin = me?.role === "ADMIN";
  const activeOrgId = isAdmin ? selectedOrgId : me?.organizationId ?? "";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setMe(d.user ?? null));
  }, []);

  useEffect(() => {
    if (me?.role === "ADMIN") {
      fetch("/api/admin/organizations")
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => setOrgOptions(Array.isArray(rows) ? rows : []))
        .catch(() => setOrgOptions([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role]);

  async function load() {
    setLoading(true);
    const url = isAdmin ? `/api/vendors/scorecard?organizationId=${activeOrgId}` : "/api/vendors/scorecard";
    const res = await fetch(url);
    const data = await res.json().catch(() => []);
    setScorecards(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    if (!me) return;
    if (isAdmin && !activeOrgId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScorecards([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInsights(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, activeOrgId]);

  function selectOrg(orgId: string) {
    setSelectedOrgId(orgId);
    const params = new URLSearchParams(searchParams.toString());
    if (orgId) params.set("org", orgId); else params.delete("org");
    router.replace(`/vendors${params.toString() ? `?${params.toString()}` : ""}`);
  }

  async function generateInsights() {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const res = await fetch("/api/ai/vendor-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: isAdmin ? activeOrgId : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInsightsError(data?.error ?? "Couldn't generate insights.");
        return;
      }
      setInsights(data);
    } finally {
      setInsightsLoading(false);
    }
  }

  return (
    <div>
      <Topbar
        title="Vendor Scorecard"
        subtitle="Delivery timeliness, funding, and test results across every vendor your SOWs have engaged"
      />
      <div className="p-8 max-w-5xl space-y-6">
        {isAdmin && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500">Company</span>
            <select value={selectedOrgId} onChange={(e) => selectOrg(e.target.value)} className={`${inputCls} max-w-xs`}>
              <option value="">— Select a company —</option>
              {orgOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400">Vendor scorecards are per-company — pick one to see its vendors.</span>
          </div>
        )}

        {(!isAdmin || activeOrgId) && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-900">Vendor performance</p>
              {scorecards.length >= 2 && (
                <button
                  onClick={generateInsights}
                  disabled={insightsLoading}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 font-medium"
                >
                  {insightsLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {insightsLoading ? "Comparing..." : "Compare with AI"}
                </button>
              )}
            </div>

            {insightsError && <p className="text-xs text-rose-600 mb-3">{insightsError}</p>}
            {insights && (
              <div className="mb-4 border border-slate-200 bg-slate-50 rounded-lg p-3 space-y-2">
                <p className="text-xs text-slate-600">{insights.summary}</p>
                {insights.standouts.length > 0 && (
                  <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">
                    {insights.standouts.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                )}
              </div>
            )}

            {loading ? (
              <p className="text-sm text-slate-400 text-center py-6">Loading...</p>
            ) : scorecards.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">
                No signed SOWs yet — vendor scorecards build up as SOWs are created against projects.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                      <th className="pb-2 pr-3 font-medium">Vendor</th>
                      <th className="pb-2 pr-3 font-medium">SOWs</th>
                      <th className="pb-2 pr-3 font-medium">Status mix</th>
                      <th className="pb-2 pr-3 font-medium">Total funding</th>
                      <th className="pb-2 pr-3 font-medium">Test pass rate</th>
                      <th className="pb-2 font-medium">Projects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorecards.map((v) => (
                      <tr key={v.vendorName} className="border-b border-slate-50 last:border-0">
                        <td className="py-2.5 pr-3 font-medium text-slate-800">{v.vendorName}</td>
                        <td className="py-2.5 pr-3 text-slate-600">{v.sowCount}</td>
                        <td className="py-2.5 pr-3 text-slate-500 text-xs">
                          {Object.entries(v.statusBreakdown).map(([s, c]) => `${s.replace("_", " ")}: ${c}`).join(", ")}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600">${v.totalFunding.toLocaleString()}</td>
                        <td className="py-2.5 pr-3">
                          {v.testPassRate != null ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 ${
                              v.testPassRate >= 80 ? "bg-emerald-50 text-emerald-700" : v.testPassRate >= 50 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                            }`}>
                              <TrendingUp size={11} /> {v.testPassRate}%
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">no data</span>
                          )}
                        </td>
                        <td className="py-2.5 text-slate-500 text-xs">{v.projects.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
