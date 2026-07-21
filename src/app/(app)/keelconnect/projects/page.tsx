"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { Plus, Globe2 } from "lucide-react";

type Organization = { id: string; name: string; orgType: "CLIENT" | "VENDOR" };
type Project = {
  id: string;
  title: string;
  status: string;
  category: string | null;
  currency: string;
  targetBudget: number | null;
  engagementModel: string;
  clientOrgId: string;
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  OPEN: "bg-emerald-50 text-emerald-700",
  NEGOTIATING: "bg-amber-50 text-amber-700",
  AWARDED: "bg-accent-50 text-accent-700",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-slate-100 text-slate-500",
  CANCELLED: "bg-rose-50 text-rose-700",
};

export default function KeelConnectProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientOrgId: "",
    title: "",
    description: "",
    category: "",
    targetBudget: "",
    currency: "USD",
    engagementModel: "MARKETPLACE",
  });

  async function load() {
    setLoading(true);
    const [projectsRes, orgsRes] = await Promise.all([
      fetch("/api/keelconnect/projects"),
      fetch("/api/keelconnect/organizations"),
    ]);
    if (projectsRes.ok) setProjects(await projectsRes.json());
    if (orgsRes.ok) setOrgs(await orgsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const clientOrgs = orgs.filter((o) => o.orgType === "CLIENT");

  async function createProject() {
    if (!form.title.trim() || !form.clientOrgId) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/keelconnect/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, targetBudget: form.targetBudget ? Number(form.targetBudget) : undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not create project.");
      return;
    }
    setShowForm(false);
    setForm({ clientOrgId: "", title: "", description: "", category: "", targetBudget: "", currency: "USD", engagementModel: "MARKETPLACE" });
    load();
  }

  return (
    <div>
      <Topbar
        title="Projects"
        subtitle="Browse the marketplace, or post a project for outsourcing"
        action={
          clientOrgs.length > 0 && (
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-accent-600 text-white font-medium hover:bg-accent-700"
            >
              <Plus size={15} /> Post a project
            </button>
          )
        }
      />
      <div className="p-8 max-w-4xl space-y-6">
        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Post a new project</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select value={form.clientOrgId} onChange={(e) => setForm((f) => ({ ...f, clientOrgId: e.target.value }))} className={inputCls}>
                <option value="">Posting as...</option>
                {clientOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <input placeholder="Category (e.g. Web Development)" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={inputCls} />
              <input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
              <div className="flex gap-2">
                <input placeholder="Target budget" type="number" value={form.targetBudget} onChange={(e) => setForm((f) => ({ ...f, targetBudget: e.target.value }))} className={inputCls} />
                <input placeholder="USD" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className={`${inputCls} w-24 shrink-0`} />
              </div>
              <select value={form.engagementModel} onChange={(e) => setForm((f) => ({ ...f, engagementModel: e.target.value }))} className={inputCls}>
                <option value="MARKETPLACE">Marketplace (direct Client-Vendor agreement)</option>
                <option value="MEDIATOR">Mediator (Keel contracts both sides)</option>
              </select>
            </div>
            <textarea
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={`${inputCls} min-h-20`}
            />
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              onClick={createProject}
              disabled={saving || !form.title.trim() || !form.clientOrgId}
              className="px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save as draft"}
            </button>
            <p className="text-xs text-slate-400">Saved as DRAFT — open it and post it to make it visible to Vendors.</p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-3">Projects</p>
          {loading ? (
            <p className="text-xs text-slate-400">Loading...</p>
          ) : projects.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No projects visible yet.</p>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/keelconnect/projects/${p.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-accent-200 hover:bg-accent-50/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Globe2 size={16} className="text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.title}</p>
                      <p className="text-xs text-slate-400">
                        {p.category ?? "Uncategorized"}{p.targetBudget ? ` · ${p.currency} ${p.targetBudget.toLocaleString()}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {p.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
