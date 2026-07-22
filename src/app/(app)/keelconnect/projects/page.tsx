"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { Plus, Globe2, Users, Sparkles, Loader2, Search, X } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";

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
  requestType?: "PROJECT" | "RESOURCE_REQUEST";
  durationWeeks?: number | null;
  rateType?: string | null;
};

const emptyFilters = { q: "", category: "", skill: "", minBudget: "", maxBudget: "", requestType: "", engagementModel: "" };

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
  const emptyForm = {
    clientOrgId: "",
    title: "",
    description: "",
    category: "",
    targetBudget: "",
    currency: "USD",
    engagementModel: "MARKETPLACE",
    locationRequirement: "GLOBAL",
    requestType: "PROJECT" as "PROJECT" | "RESOURCE_REQUEST",
    skillsRequired: "",
    durationWeeks: "",
    rateType: "HOURLY",
  };
  const [form, setForm] = useState(emptyForm);
  const [draftNote, setDraftNote] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);

  async function draftWithAI() {
    if (!draftNote.trim()) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch("/api/ai/draft-keelconnect-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: draftNote, requestType: form.requestType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDraftError(data?.error ?? "Couldn't draft this posting right now.");
        return;
      }
      setForm((f) => ({
        ...f,
        title: data.title ?? f.title,
        description: data.description ?? f.description,
        category: data.category ?? f.category,
        targetBudget: typeof data.targetBudget === "number" && data.targetBudget > 0 ? String(data.targetBudget) : f.targetBudget,
        currency: data.currency ?? f.currency,
        engagementModel: data.engagementModel === "MEDIATOR" ? "MEDIATOR" : "MARKETPLACE",
        locationRequirement: data.locationRequirement === "RESTRICTED" ? "RESTRICTED" : "GLOBAL",
        skillsRequired: Array.isArray(data.skillsRequired) ? data.skillsRequired.join(", ") : f.skillsRequired,
        durationWeeks: typeof data.durationWeeks === "number" && data.durationWeeks > 0 ? String(data.durationWeeks) : f.durationWeeks,
        rateType: ["HOURLY", "DAILY", "WEEKLY", "FIXED"].includes(data.rateType) ? data.rateType : f.rateType,
      }));
    } finally {
      setDrafting(false);
    }
  }

  async function load(f: typeof emptyFilters = filters) {
    setLoading(true);
    const params = new URLSearchParams();
    if (f.q.trim()) params.set("q", f.q.trim());
    if (f.category.trim()) params.set("category", f.category.trim());
    if (f.skill.trim()) params.set("skill", f.skill.trim());
    if (f.minBudget) params.set("minBudget", f.minBudget);
    if (f.maxBudget) params.set("maxBudget", f.maxBudget);
    if (f.requestType) params.set("requestType", f.requestType);
    if (f.engagementModel) params.set("engagementModel", f.engagementModel);
    const qs = params.toString();
    const [projectsRes, orgsRes] = await Promise.all([
      fetch(`/api/keelconnect/projects${qs ? `?${qs}` : ""}`),
      fetch("/api/keelconnect/organizations"),
    ]);
    if (projectsRes.ok) setProjects(await projectsRes.json());
    if (orgsRes.ok) setOrgs(await orgsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(emptyFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters() {
    load(filters);
  }

  function clearFilters() {
    setFilters(emptyFilters);
    load(emptyFilters);
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const clientOrgs = orgs.filter((o) => o.orgType === "CLIENT");

  async function createProject() {
    if (!form.title.trim() || !form.clientOrgId) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/keelconnect/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        targetBudget: form.targetBudget ? Number(form.targetBudget) : undefined,
        skillsRequired: form.requestType === "RESOURCE_REQUEST" && form.skillsRequired.trim()
          ? form.skillsRequired.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        durationWeeks: form.requestType === "RESOURCE_REQUEST" && form.durationWeeks ? Number(form.durationWeeks) : undefined,
        rateType: form.requestType === "RESOURCE_REQUEST" ? form.rateType : undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not create project.");
      return;
    }
    setShowForm(false);
    setForm(emptyForm);
    setDraftNote("");
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
            <p className="text-sm font-semibold text-slate-900">
              {form.requestType === "RESOURCE_REQUEST" ? "Post a new resource request" : "Post a new project"}
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setForm((f) => ({ ...f, requestType: "PROJECT" }))}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                  form.requestType === "PROJECT" ? "bg-accent-600 text-white border-accent-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Globe2 size={13} /> Project
              </button>
              <button
                onClick={() => setForm((f) => ({ ...f, requestType: "RESOURCE_REQUEST" }))}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                  form.requestType === "RESOURCE_REQUEST" ? "bg-accent-600 text-white border-accent-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Users size={13} /> Resource Request
              </button>
            </div>
            <p className="text-xs text-slate-400">
              {form.requestType === "RESOURCE_REQUEST"
                ? "A staffing need (e.g. \"2 senior React developers, 3 months\") — Vendors offer a rate instead of bidding a fixed project price."
                : "A scoped deliverable-based engagement — Vendors bid a price to complete it."}
            </p>

            <div className="border border-accent-100 bg-accent-50/60 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-slate-600">Describe the work (one line is fine) — AI drafts the fields below</p>
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                className={`${inputCls} min-h-16`}
                placeholder={
                  form.requestType === "RESOURCE_REQUEST"
                    ? "e.g. need 2 senior React developers for about 3 months, budget around 40/hr each"
                    : "e.g. need someone to migrate our legacy PHP billing system to a modern stack, budget around 40k"
                }
              />
              <button
                onClick={draftWithAI}
                disabled={drafting || !draftNote.trim()}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 disabled:opacity-50 font-medium"
              >
                {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {drafting ? "Drafting..." : "Draft with AI"}
              </button>
              <AiWaitIndicator active={drafting} messages={["Reading your note...", "Filling in the fields..."]} />
              {draftError && <p className="text-xs text-rose-600">{draftError}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select value={form.clientOrgId} onChange={(e) => setForm((f) => ({ ...f, clientOrgId: e.target.value }))} className={inputCls}>
                <option value="">Posting as...</option>
                {clientOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <input placeholder="Category (e.g. Web Development)" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={inputCls} />
              <input
                placeholder={form.requestType === "RESOURCE_REQUEST" ? "Title (e.g. Senior React Developer x2)" : "Title"}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className={inputCls}
              />
              <div className="flex gap-2">
                <input placeholder="Target budget" type="number" value={form.targetBudget} onChange={(e) => setForm((f) => ({ ...f, targetBudget: e.target.value }))} className={inputCls} />
                <input placeholder="USD" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className={`${inputCls} w-24 shrink-0`} />
              </div>
              <select value={form.engagementModel} onChange={(e) => setForm((f) => ({ ...f, engagementModel: e.target.value }))} className={inputCls}>
                <option value="MARKETPLACE">Marketplace (direct Client-Vendor agreement)</option>
                <option value="MEDIATOR">Mediator (Keel contracts both sides)</option>
              </select>
              <select value={form.locationRequirement} onChange={(e) => setForm((f) => ({ ...f, locationRequirement: e.target.value }))} className={inputCls}>
                <option value="GLOBAL">Global (any vendor)</option>
                <option value="RESTRICTED">Restricted to certain countries</option>
              </select>
              {form.requestType === "RESOURCE_REQUEST" && (
                <>
                  <input
                    placeholder="Skills required (comma separated)"
                    value={form.skillsRequired}
                    onChange={(e) => setForm((f) => ({ ...f, skillsRequired: e.target.value }))}
                    className={`${inputCls} sm:col-span-2`}
                  />
                  <input
                    placeholder="Duration (weeks)"
                    type="number"
                    value={form.durationWeeks}
                    onChange={(e) => setForm((f) => ({ ...f, durationWeeks: e.target.value }))}
                    className={inputCls}
                  />
                  <select value={form.rateType} onChange={(e) => setForm((f) => ({ ...f, rateType: e.target.value }))} className={inputCls}>
                    <option value="HOURLY">Hourly rate</option>
                    <option value="DAILY">Daily rate</option>
                    <option value="WEEKLY">Weekly rate</option>
                    <option value="FIXED">Fixed total</option>
                  </select>
                </>
              )}
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-900">Projects</p>
            <button
              onClick={() => setShowFilters((s) => !s)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
            >
              <Search size={13} /> Search & filter{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </button>
          </div>

          {showFilters && (
            <div className="mb-4 p-3 rounded-lg border border-slate-100 bg-slate-50/60 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  placeholder="Search title/description"
                  value={filters.q}
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                  className={inputCls}
                />
                <input
                  placeholder="Category"
                  value={filters.category}
                  onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
                  className={inputCls}
                />
                <input
                  placeholder="Skill"
                  value={filters.skill}
                  onChange={(e) => setFilters((f) => ({ ...f, skill: e.target.value }))}
                  className={inputCls}
                />
                <input
                  placeholder="Min budget"
                  type="number"
                  value={filters.minBudget}
                  onChange={(e) => setFilters((f) => ({ ...f, minBudget: e.target.value }))}
                  className={inputCls}
                />
                <input
                  placeholder="Max budget"
                  type="number"
                  value={filters.maxBudget}
                  onChange={(e) => setFilters((f) => ({ ...f, maxBudget: e.target.value }))}
                  className={inputCls}
                />
                <select value={filters.requestType} onChange={(e) => setFilters((f) => ({ ...f, requestType: e.target.value }))} className={inputCls}>
                  <option value="">Any type</option>
                  <option value="PROJECT">Project</option>
                  <option value="RESOURCE_REQUEST">Resource request</option>
                </select>
                <select
                  value={filters.engagementModel}
                  onChange={(e) => setFilters((f) => ({ ...f, engagementModel: e.target.value }))}
                  className={`${inputCls} sm:col-span-2`}
                >
                  <option value="">Any engagement model</option>
                  <option value="MARKETPLACE">Marketplace</option>
                  <option value="MEDIATOR">Mediator</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={applyFilters}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent-600 text-white font-medium hover:bg-accent-700"
                >
                  Apply
                </button>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
                  >
                    <X size={13} /> Clear
                  </button>
                )}
              </div>
            </div>
          )}

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
                    {p.requestType === "RESOURCE_REQUEST" ? (
                      <Users size={16} className="text-slate-400" />
                    ) : (
                      <Globe2 size={16} className="text-slate-400" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.title}</p>
                      <p className="text-xs text-slate-400">
                        {p.requestType === "RESOURCE_REQUEST" ? "Resource request" : p.category ?? "Uncategorized"}
                        {p.targetBudget
                          ? ` · ${p.currency} ${p.targetBudget.toLocaleString()}${p.requestType === "RESOURCE_REQUEST" && p.rateType ? `/${p.rateType.toLowerCase()}` : ""}`
                          : ""}
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
