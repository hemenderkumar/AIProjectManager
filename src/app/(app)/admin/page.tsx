"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { Plus, Trash2 } from "lucide-react";

type User = { id: string; name: string; email: string; role: string };
type Settings = { weeklyReportCadence: string; steeringCadence: string; avatarVoiceGender: string };

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "CONTRIBUTOR" });

  async function load() {
    const [u, s] = await Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/settings").then((r) => r.json()),
    ]);
    setUsers(Array.isArray(u) ? u : []);
    setSettings(s);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function createUser() {
    if (!form.name || !form.email || !form.password) return;
    setSaving(true);
    await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ name: "", email: "", password: "", role: "CONTRIBUTOR" });
    load();
  }

  async function updateRole(id: string, role: string) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    load();
  }

  async function removeUser(id: string) {
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    load();
  }

  async function updateSettings(patch: Partial<Settings>) {
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSettings(await res.json());
  }

  return (
    <div>
      <Topbar title="Admin" subtitle="Manage users, roles, and automation settings" />
      <div className="p-8 max-w-3xl space-y-6">

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-900">Users & roles</p>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
            >
              <Plus size={14} /> Add User
            </button>
          </div>

          {showForm && (
            <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
                <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
                <input placeholder="Temporary password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className={inputCls} />
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inputCls}>
                  {["ADMIN", "PM", "CONTRIBUTOR", "VIEWER"].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button onClick={createUser} disabled={saving} className="px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "Creating..." : "Create user"}
              </button>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">{u.name}</td>
                  <td className="py-2.5 text-slate-600">{u.email}</td>
                  <td className="py-2.5">
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u.id, e.target.value)}
                      className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                    >
                      {["ADMIN", "PM", "CONTRIBUTOR", "VIEWER"].map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => removeUser(u.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-slate-400">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {settings && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-900 mb-4">Automation settings</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Weekly status report</label>
                <select
                  value={settings.weeklyReportCadence}
                  onChange={(e) => updateSettings({ weeklyReportCadence: e.target.value })}
                  className={inputCls}
                >
                  {["WEEKLY", "BIWEEKLY", "MONTHLY", "MANUAL"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Steering committee pack</label>
                <select
                  value={settings.steeringCadence}
                  onChange={(e) => updateSettings({ steeringCadence: e.target.value })}
                  className={inputCls}
                >
                  {["WEEKLY", "BIWEEKLY", "MONTHLY", "MANUAL"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Avatar voice</label>
                <select
                  value={settings.avatarVoiceGender}
                  onChange={(e) => updateSettings({ avatarVoiceGender: e.target.value })}
                  className={inputCls}
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Cadences run via a scheduled job (Vercel Cron) configured in vercel.json — see README for setup.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
