"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Topbar from "@/components/Topbar";
import { Plus, Trash2, Search } from "lucide-react";
import { SOURCING_TYPES, SOURCING_LABELS, type SourcingType } from "@/lib/deliveryModel";
import RateCardSection from "@/components/RateCardSection";
import ExportButtons from "@/components/ExportButtons";

type Resource = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  capacityHoursPerWk: number | null;
  costPerHour: number | null;
  skills: string[] | null;
  experienceYears: number | null;
  sourcingType: SourcingType | null;
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

const emptyForm = {
  name: "",
  role: "",
  email: "",
  capacityHoursPerWk: 40,
  costPerHour: 0,
  skills: "",
  experienceYears: 0,
  sourcingType: "ONSITE" as SourcingType,
};

function parseSkills(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [skillFilter, setSkillFilter] = useState("");
  const [minExperience, setMinExperience] = useState(0);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/resources");
    const data = await res.json();
    setResources(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }

  function startEdit(r: Resource) {
    setEditingId(r.id);
    setForm({
      name: r.name,
      role: r.role ?? "",
      email: r.email ?? "",
      capacityHoursPerWk: r.capacityHoursPerWk ?? 40,
      costPerHour: r.costPerHour ?? 0,
      skills: (r.skills ?? []).join(", "),
      experienceYears: r.experienceYears ?? 0,
      sourcingType: r.sourcingType ?? "ONSITE",
    });
    setError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      role: form.role || null,
      email: form.email || null,
      capacityHoursPerWk: form.capacityHoursPerWk,
      costPerHour: form.costPerHour,
      skills: parseSkills(form.skills),
      experienceYears: form.experienceYears,
      sourcingType: form.sourcingType,
    };
    const res = await fetch(editingId ? `/api/resources/${editingId}` : "/api/resources", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not save this resource.");
      return;
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    load();
  }

  // Debounce per-resource so fast typing (e.g. "1", "12", "125") doesn't fire a PATCH per
  // keystroke — the UI updates instantly (optimistic), the save trails behind by 400ms.
  const rateSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function updateRate(id: string, costPerHour: number) {
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, costPerHour } : r)));
    clearTimeout(rateSaveTimers.current[id]);
    rateSaveTimers.current[id] = setTimeout(async () => {
      const res = await fetch(`/api/resources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costPerHour }),
      });
      if (!res.ok) load(); // roll back to server truth if the save failed
    }, 400);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/resources/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "Could not delete this resource.");
      return;
    }
    load();
  }

  const allSkills = useMemo(() => {
    const set = new Set<string>();
    resources.forEach((r) => (r.skills ?? []).forEach((s) => set.add(s)));
    return [...set].sort();
  }, [resources]);

  const filtered = resources.filter((r) => {
    const matchesSkill =
      !skillFilter.trim() ||
      (r.skills ?? []).some((s) => s.toLowerCase().includes(skillFilter.trim().toLowerCase()));
    const matchesExperience = (r.experienceYears ?? 0) >= minExperience;
    return matchesSkill && matchesExperience;
  });

  return (
    <div>
      <Topbar
        title="Resources"
        subtitle="Your team roster — skills and experience feed directly into AI task matching and cost estimates"
        action={
          <div className="flex items-center gap-2">
            <ExportButtons endpoint="/api/reports/resources" filenamePrefix="resources" />
            <button
              onClick={startCreate}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700"
            >
              <Plus size={16} /> Add Resource
            </button>
          </div>
        }
      />
      <div className="p-8 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Search by skill</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={skillFilter}
                onChange={(e) => setSkillFilter(e.target.value)}
                placeholder="e.g. React, Salesforce, plumbing..."
                className={`${inputCls} pl-8`}
                list="known-skills"
              />
              <datalist id="known-skills">
                {allSkills.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="w-48">
            <label className="block text-xs font-medium text-slate-500 mb-1">Min. experience (years)</label>
            <input
              type="number"
              min={0}
              value={minExperience}
              onChange={(e) => setMinExperience(Number(e.target.value))}
              className={inputCls}
            />
          </div>
          {(skillFilter || minExperience > 0) && (
            <button
              onClick={() => {
                setSkillFilter("");
                setMinExperience(0);
              }}
              className="text-xs text-slate-400 hover:text-slate-600 pb-2"
            >
              Clear filters
            </button>
          )}
        </div>

        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-900">{editingId ? "Edit resource" : "New resource"}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
                <input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inputCls} placeholder="e.g. Backend Engineer" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Experience (years)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.experienceYears}
                  onChange={(e) => setForm((f) => ({ ...f, experienceYears: Number(e.target.value) }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Weekly capacity (hrs)</label>
                <input
                  type="number"
                  min={0}
                  value={form.capacityHoursPerWk}
                  onChange={(e) => setForm((f) => ({ ...f, capacityHoursPerWk: Number(e.target.value) }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Cost per hour ($)</label>
                <input
                  type="number"
                  min={0}
                  value={form.costPerHour}
                  onChange={(e) => setForm((f) => ({ ...f, costPerHour: Number(e.target.value) }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Sourcing</label>
                <select
                  value={form.sourcingType}
                  onChange={(e) => setForm((f) => ({ ...f, sourcingType: e.target.value as SourcingType }))}
                  className={inputCls}
                >
                  {SOURCING_TYPES.map((s) => (
                    <option key={s} value={s}>{SOURCING_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Skills (comma-separated)</label>
              <input
                value={form.skills}
                onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
                className={inputCls}
                placeholder="e.g. React, Node.js, AWS, Salesforce Apex"
              />
            </div>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Save changes" : "Create resource"}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Skills</th>
                <th className="px-4 py-2.5 font-medium">Experience</th>
                <th className="px-4 py-2.5 font-medium">Capacity</th>
                <th className="px-4 py-2.5 font-medium">Rate</th>
                <th className="px-4 py-2.5 font-medium">Sourcing</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button onClick={() => startEdit(r)} className="font-medium text-slate-900 hover:text-accent-600 text-left">
                      {r.name}
                    </button>
                    {r.email && <p className="text-xs text-slate-400">{r.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.role ?? "—"}</td>
                  <td className="px-4 py-3">
                    {(r.skills ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {(r.skills ?? []).map((s) => (
                          <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">No skills listed</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.experienceYears ? `${r.experienceYears} yrs` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.capacityHoursPerWk ?? "—"} hrs/wk</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="flex items-center gap-0.5">
                      <span className="text-slate-400 text-xs">$</span>
                      <input
                        type="number"
                        min={0}
                        value={r.costPerHour ?? 0}
                        onChange={(e) => updateRate(r.id, Number(e.target.value))}
                        className="w-16 text-sm border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-accent-500"
                      />
                      <span className="text-slate-400 text-xs">/hr</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.sourcingType ? SOURCING_LABELS[r.sourcingType] : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400">
                    {resources.length === 0 ? "No resources yet." : "No resources match this search."}
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </div>

        <RateCardSection />
      </div>
    </div>
  );
}
