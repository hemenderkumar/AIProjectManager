"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SOURCING_TYPES, SOURCING_LABELS, type SourcingType } from "@/lib/deliveryModel";

type RateCard = {
  id: string;
  role: string;
  sourcingType: SourcingType;
  hourlyRate: number;
  notes: string | null;
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500";

const emptyForm = { role: "", sourcingType: "ONSITE" as SourcingType, hourlyRate: 0, notes: "" };

// Reference rates by role + sourcing type. This is what makes support and project-execution
// rates changeable in one place — the Support Cost Estimator and each project's Delivery &
// Pricing tab both read from here instead of a hardcoded number. Scoped by the caller's role
// on the server (own company for a SUPER_USER, global defaults for internal staff) unless an
// explicit `organizationId` is passed — used by Admin's per-company drill-down, where an
// ADMIN picks which company's rates to view/edit.
export default function RateCardSection({ organizationId, title }: { organizationId?: string; title?: string }) {
  const [cards, setCards] = useState<RateCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/rate-cards${query}`);
    const data = await res.json();
    setCards(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function save() {
    if (!form.role.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/rate-cards${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not save this rate.");
      return;
    }
    setShowForm(false);
    setForm(emptyForm);
    load();
  }

  async function updateRate(id: string, hourlyRate: number) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, hourlyRate } : c)));
    await fetch(`/api/rate-cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hourlyRate }),
    });
  }

  async function remove(id: string) {
    await fetch(`/api/rate-cards/${id}`, { method: "DELETE" });
    load();
  }

  const grouped = SOURCING_TYPES.map((type) => ({
    type,
    rows: cards.filter((c) => c.sourcingType === type),
  }));

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title ?? "Rate Card"}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Editable $/hr by role and sourcing model — used by the Support Cost Estimator and every
            project&apos;s Delivery &amp; Pricing tab. Change a rate here and it flows through everywhere.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 shrink-0"
        >
          <Plus size={14} /> Add Rate
        </button>
      </div>

      {showForm && (
        <div className="p-4 bg-slate-50 rounded-lg space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
              <input
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className={inputCls}
                placeholder="e.g. Backend Engineer"
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
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Rate ($/hr)</label>
              <input
                type="number"
                min={0}
                value={form.hourlyRate}
                onChange={(e) => setForm((f) => ({ ...f, hourlyRate: Number(e.target.value) }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
              <input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className={inputCls}
                placeholder="optional"
              />
            </div>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add rate"}
            </button>
            <button onClick={() => setShowForm(false)} className="text-xs text-slate-500 hover:text-slate-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {grouped.map(({ type, rows }) => (
          <div key={type} className="border border-slate-100 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-100">
              {SOURCING_LABELS[type]}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 text-slate-700">
                      {c.role}
                      {c.notes && <p className="text-xs text-slate-400">{c.notes}</p>}
                    </td>
                    <td className="px-2 py-2 w-24">
                      <div className="flex items-center gap-0.5">
                        <span className="text-slate-400 text-xs">$</span>
                        <input
                          type="number"
                          min={0}
                          value={c.hourlyRate}
                          onChange={(e) => updateRate(c.id, Number(e.target.value))}
                          className="w-16 text-sm border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-accent-500"
                        />
                        <span className="text-slate-400 text-xs">/hr</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 w-8 text-right">
                      <button onClick={() => remove(c.id)} className="text-slate-400 hover:text-rose-600">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-xs text-slate-300">
                      No rates set — a fallback default is used until you add one.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
