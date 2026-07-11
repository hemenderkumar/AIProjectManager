"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import { Plus, Loader2, FileText } from "lucide-react";

type Rfp = { id: string; title: string; status: string; projectId: string | null; createdAt: string; updatedAt: string };
type ProjectOption = { id: string; name: string; organizationId: string | null };
type OrgOption = { id: string; name: string };
type SessionUser = { id: string; name: string; role: string; organizationId: string | null };

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PUBLISHED: "bg-indigo-50 text-indigo-700",
  EVALUATING: "bg-amber-50 text-amber-700",
  AWARDED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-slate-100 text-slate-500",
};

export default function VendorEvaluationPage() {
  return (
    <Suspense fallback={null}>
      <VendorEvaluationInner />
    </Suspense>
  );
}

function VendorEvaluationInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  // For an ADMIN, which company they're currently working within — carried in the URL so
  // it survives a refresh and so a link to this page can point straight at one company.
  const [selectedOrgId, setSelectedOrgId] = useState(searchParams.get("org") ?? "");

  const [rfps, setRfps] = useState<Rfp[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "", projectId: "", background: "", scope: "", requirements: "", timeline: "", budgetRange: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = me?.role === "ADMIN";
  // Which company this workspace is currently scoped to: for a SUPER_USER it's always their
  // own org; for an ADMIN it's whichever company they've picked above.
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
    const rfpUrl = isAdmin ? `/api/rfps?organizationId=${activeOrgId}` : "/api/rfps";
    const [rfpRes, projRes] = await Promise.all([fetch(rfpUrl), fetch("/api/projects")]);
    if (rfpRes.ok) setRfps(await rfpRes.json());
    if (projRes.ok) {
      const all = await projRes.json();
      setAllProjects(Array.isArray(all) ? all.map((p: { id: string; name: string; organizationId: string | null }) => ({ id: p.id, name: p.name, organizationId: p.organizationId })) : []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!me) return;
    if (isAdmin && !activeOrgId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRfps([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, activeOrgId]);

  function selectOrg(orgId: string) {
    setSelectedOrgId(orgId);
    const params = new URLSearchParams(searchParams.toString());
    if (orgId) params.set("org", orgId); else params.delete("org");
    router.replace(`/vendor-evaluation${params.toString() ? `?${params.toString()}` : ""}`);
  }

  // Only offer projects that actually belong to the company this workspace is scoped to —
  // otherwise the RFP would silently fail to link (the API drops a mismatched projectId).
  const projectOptions = allProjects.filter((p) => p.organizationId === (activeOrgId || null));

  async function createRfp(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/rfps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          projectId: form.projectId || undefined,
          organizationId: isAdmin ? activeOrgId : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't create the RFP.");
        return;
      }
      router.push(`/vendor-evaluation/${data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Topbar
        title="Vendor Evaluation"
        subtitle="Draft RFPs, invite vendors, and let AI score responses against your own rubric"
      />
      <div className="p-8 max-w-4xl space-y-6">
        {isAdmin && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500">Company</span>
            <select value={selectedOrgId} onChange={(e) => selectOrg(e.target.value)} className={`${inputCls} max-w-xs`}>
              <option value="">— Select a company —</option>
              {orgOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400">Vendor Evaluation is per-company — pick one to see or create its RFPs.</span>
          </div>
        )}

        {(!isAdmin || activeOrgId) && (
          <div className="flex justify-end">
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
            >
              <Plus size={15} /> New RFP
            </button>
          </div>
        )}

        {showForm && (
          <form onSubmit={createRfp} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <p className="text-sm font-semibold text-slate-900">New Request for Proposal</p>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Title *</span>
                <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="e.g. CRM Implementation RFP" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Link to project (optional)</span>
                <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} className={inputCls}>
                  <option value="">— Standalone, no project —</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-slate-500">
              If the linked project already has a completed charter, AI will draft the RFP from it automatically.
              Otherwise, add a few pointers below and AI will draft from those instead — all optional, and everything
              can be edited before you publish.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Background</span>
                <textarea value={form.background} onChange={(e) => setForm((f) => ({ ...f, background: e.target.value }))} className={inputCls} rows={2} />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Scope</span>
                <textarea value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} className={inputCls} rows={2} />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Requirements</span>
                <textarea value={form.requirements} onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))} className={inputCls} rows={2} />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Timeline</span>
                <input value={form.timeline} onChange={(e) => setForm((f) => ({ ...f, timeline: e.target.value }))} className={inputCls} placeholder="e.g. Kickoff Q3, go-live in 4 months" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Budget range</span>
                <input value={form.budgetRange} onChange={(e) => setForm((f) => ({ ...f, budgetRange: e.target.value }))} className={inputCls} placeholder="e.g. $80k–$120k" />
              </label>
            </div>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? "Creating..." : "Create RFP"}
            </button>
          </form>
        )}

        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {isAdmin && !activeOrgId ? (
            <p className="p-5 text-sm text-slate-400">Pick a company above to see its RFPs.</p>
          ) : loading ? (
            <p className="p-5 text-sm text-slate-400">Loading...</p>
          ) : rfps.length === 0 ? (
            <p className="p-5 text-sm text-slate-400">No RFPs yet — create one to invite vendors and start collecting proposals.</p>
          ) : (
            rfps.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/vendor-evaluation/${r.id}`)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50"
              >
                <div className="flex items-center gap-2.5">
                  <FileText size={16} className="text-slate-400" />
                  <span className="text-sm font-medium text-slate-900">{r.title}</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                  {r.status}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
