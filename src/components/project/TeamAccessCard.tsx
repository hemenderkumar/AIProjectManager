"use client";
import { useEffect, useState } from "react";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { Plus, Trash2 } from "lucide-react";

type Member = { id: string; userId: string; name: string; email: string; role: string };
type AllUser = { id: string; name: string; email: string; role: string };

export default function TeamAccessCard({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [m, u] = await Promise.all([
      fetch(`/api/projects/${projectId}/members`).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/admin/users").then((r) => (r.ok ? r.json() : [])),
    ]);
    setMembers(Array.isArray(m) ? m : []);
    setAllUsers(Array.isArray(u) ? u : []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [projectId]);

  const memberUserIds = new Set(members.map((m) => m.userId));
  const available = allUsers.filter((u) => !memberUserIds.has(u.id));

  async function addMember() {
    if (!userId) return;
    setSaving(true);
    await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setSaving(false);
    setShowForm(false);
    setUserId("");
    load();
  }

  async function removeMember(memberId: string) {
    await fetch(`/api/projects/${projectId}/members/${memberId}`, { method: "DELETE" });
    load();
  }

  return (
    <Card
      title={`Team access (${members.length})`}
      action={
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
        >
          <Plus size={14} /> Grant access
        </button>
      }
    >
      <p className="text-xs text-slate-400 mb-3">
        Who can see and update this project when they log in. Admins can see everything regardless of this list.
      </p>
      {showForm && (
        <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
          <Field label="User">
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inputCls}>
              <option value="">Select a user...</option>
              {available.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </Field>
          <PrimaryButton onClick={addMember} disabled={saving}>{saving ? "Adding..." : "Grant access"}</PrimaryButton>
        </div>
      )}
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-800">{m.name}</p>
              <p className="text-xs text-slate-400">{m.email} · {m.role}</p>
            </div>
            <button onClick={() => removeMember(m.id)} className="text-slate-400 hover:text-rose-600">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {members.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Everyone with ADMIN role can see this project. No specific team members granted yet.</p>}
      </div>
    </Card>
  );
}
