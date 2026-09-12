"use client";
import { useEffect, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";

type SkillRoleMapping = { id: string; skill: string; role: string };

// Small CRUD table, same self-contained "own its fetch" pattern as RateCardSection — lets
// internal staff teach the skill capacity forecast (see SkillCapacityForecast.tsx below on
// this page) which rate-card role a given skill should price against, instead of relying on
// the forecast's own best-effort fallback (infer from matched resources' role, or fall back
// to the raw skill name). Mappings are global, not per-company, since "React -> Frontend
// Engineer" is a taxonomy fact rather than something that differs per client.
export default function SkillRoleMapSection() {
  const [rows, setRows] = useState<SkillRoleMapping[] | null>(null);
  const [skill, setSkill] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/skill-role-map")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]));
  }

  useEffect(load, []);

  async function addMapping() {
    if (!skill.trim() || !role.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/skill-role-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill, role }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to add mapping");
      return;
    }
    setSkill("");
    setRole("");
    load();
  }

  async function removeMapping(id: string) {
    setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    await fetch(`/api/skill-role-map/${id}`, { method: "DELETE" });
  }

  if (rows === null) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 size={15} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Skill &rarr; Role Mapping</p>
        <span className="text-xs text-slate-400">— prices skill capacity gaps against the right rate-card role</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          placeholder="Skill (e.g. React)"
          className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500/30 w-40"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role (e.g. Frontend Engineer)"
          className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500/30 w-52"
        />
        <button
          onClick={addMapping}
          disabled={saving || !skill.trim() || !role.trim()}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-accent-600 text-white disabled:opacity-40 hover:bg-accent-700"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">
          No mappings yet — the skill capacity forecast will infer a role from matched resources, or fall back to
          treating the skill name itself as the role.
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 text-left border-b border-slate-100">
              <th className="font-medium py-1">Skill</th>
              <th className="font-medium py-1">Role</th>
              <th className="font-medium py-1 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="py-1.5 text-slate-700 capitalize">{r.skill}</td>
                <td className="py-1.5 text-slate-700">{r.role}</td>
                <td className="py-1.5 text-right">
                  <button onClick={() => removeMapping(r.id)} className="text-slate-300 hover:text-rose-500">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
