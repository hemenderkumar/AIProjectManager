"use client";
import { useEffect, useState } from "react";

type MyResource = {
  id: string;
  name: string;
  role: string | null;
  costPerHour: number | null;
};

// Renders nothing unless the current user has been linked to a Resources profile (an admin
// does this from Users & roles) — most users simply have no linked resource and see nothing
// here. This is the one piece of "rate" info a project-scoped user (including a
// self-registered individual) can see or edit: just their own, never anyone else's.
export default function MyRateCard() {
  const [resource, setResource] = useState<MyResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetch("/api/me/resource")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setResource(data))
      .finally(() => setLoading(false));
  }, []);

  async function updateRate(costPerHour: number) {
    setResource((prev) => (prev ? { ...prev, costPerHour } : prev));
    setSaving(true);
    await fetch("/api/me/resource", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ costPerHour }),
    });
    setSaving(false);
  }

  if (loading || !resource) return null;

  return (
    <div className="max-w-5xl bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 mb-6">
      <p className="text-sm font-semibold text-slate-900 mb-1">Your rate</p>
      <p className="text-xs text-slate-500 mb-3">
        {resource.name}{resource.role ? ` · ${resource.role}` : ""} — visible only to you and your admin.
      </p>
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400 text-sm">$</span>
        <input
          type="number"
          min={0}
          value={resource.costPerHour ?? 0}
          onChange={(e) => updateRate(Number(e.target.value))}
          className="w-24 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <span className="text-slate-400 text-sm">/hr</span>
        {saving && <span className="text-xs text-slate-400 ml-2">Saving...</span>}
      </div>
    </div>
  );
}
