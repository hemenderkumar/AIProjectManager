"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { Download, AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import RateCardSection from "@/components/RateCardSection";

type Organization = {
  id: string;
  name: string;
  createdAt: string;
  deletionRequestedAt: string | null;
  deletionRequestedBy: string | null;
};

type TeamUser = { id: string; name: string; email: string; role: string; divisionId: string | null; createdAt: string };
type Division = { id: string; name: string };
type Stakeholder = { id: string; name: string; title: string | null; email: string | null; divisionId: string | null };

const ASSIGNABLE_ROLES = ["PM", "CONTRIBUTOR", "VIEWER"];
const teamInputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function OrganizationPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [team, setTeam] = useState<TeamUser[]>([]);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamForm, setTeamForm] = useState({ name: "", email: "", password: "", role: "VIEWER" });
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [newDivisionName, setNewDivisionName] = useState("");
  const [divisionSaving, setDivisionSaving] = useState(false);
  const [divisionError, setDivisionError] = useState<string | null>(null);

  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [showStakeholderForm, setShowStakeholderForm] = useState(false);
  const [stakeholderForm, setStakeholderForm] = useState({ name: "", title: "", email: "", divisionId: "" });
  const [stakeholderSaving, setStakeholderSaving] = useState(false);
  const [stakeholderError, setStakeholderError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [orgRes, teamRes, divisionsRes, stakeholdersRes] = await Promise.all([
      fetch("/api/organization"),
      fetch("/api/organization/users"),
      fetch("/api/organization/divisions"),
      fetch("/api/organization/stakeholders"),
    ]);
    if (orgRes.ok) setOrg(await orgRes.json());
    if (teamRes.ok) setTeam(await teamRes.json());
    if (divisionsRes.ok) setDivisions(await divisionsRes.json());
    if (stakeholdersRes.ok) setStakeholders(await stakeholdersRes.json());
    setLoading(false);
  }

  async function addDivision() {
    if (!newDivisionName.trim()) return;
    setDivisionSaving(true);
    setDivisionError(null);
    const res = await fetch("/api/organization/divisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDivisionName }),
    });
    setDivisionSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDivisionError(data?.error ?? "Could not add division.");
      return;
    }
    setNewDivisionName("");
    load();
  }

  async function removeDivision(id: string) {
    await fetch(`/api/organization/divisions/${id}`, { method: "DELETE" });
    load();
  }

  async function addStakeholder() {
    if (!stakeholderForm.name.trim()) return;
    setStakeholderSaving(true);
    setStakeholderError(null);
    const res = await fetch("/api/organization/stakeholders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...stakeholderForm, divisionId: stakeholderForm.divisionId || null }),
    });
    setStakeholderSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStakeholderError(data?.error ?? "Could not add stakeholder.");
      return;
    }
    setShowStakeholderForm(false);
    setStakeholderForm({ name: "", title: "", email: "", divisionId: "" });
    load();
  }

  async function updateStakeholderDivision(id: string, divisionId: string) {
    await fetch(`/api/organization/stakeholders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ divisionId: divisionId || null }),
    });
    load();
  }

  async function removeStakeholder(id: string) {
    await fetch(`/api/organization/stakeholders/${id}`, { method: "DELETE" });
    load();
  }

  async function updateTeamDivision(id: string, divisionId: string) {
    await fetch(`/api/organization/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ divisionId: divisionId || null }),
    });
    load();
  }

  async function inviteTeamMember() {
    if (!teamForm.name || !teamForm.email || !teamForm.password) return;
    setTeamSaving(true);
    setTeamError(null);
    const res = await fetch("/api/organization/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamForm),
    });
    setTeamSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setTeamError(data?.error ?? "Could not invite this user.");
      return;
    }
    setShowTeamForm(false);
    setTeamForm({ name: "", email: "", password: "", role: "VIEWER" });
    load();
  }

  async function updateTeamRole(id: string, role: string) {
    await fetch(`/api/organization/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    load();
  }

  async function removeTeamMember(id: string) {
    await fetch(`/api/organization/users/${id}`, { method: "DELETE" });
    load();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch("/api/organization/export");
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(org?.name ?? "organization").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function requestDeletion() {
    setRequesting(true);
    setError(null);
    const res = await fetch("/api/organization/request-deletion", { method: "POST" });
    setRequesting(false);
    setShowConfirm(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not submit deletion request.");
      return;
    }
    load();
  }

  async function cancelDeletion() {
    setRequesting(true);
    await fetch("/api/organization/request-deletion", { method: "DELETE" });
    setRequesting(false);
    load();
  }

  if (loading) {
    return (
      <div>
        <Topbar title="My Organization" subtitle="Your company's data — export or request deletion" />
        <div className="p-8 text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!org) {
    return (
      <div>
        <Topbar title="My Organization" subtitle="Your company's data — export or request deletion" />
        <div className="p-8 text-sm text-slate-400">
          This page is only available to a company account owner (SUPER_USER).
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar title="My Organization" subtitle={org.name} />
      <div className="p-8 max-w-2xl space-y-6">
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-slate-900">Your team</p>
            <button
              onClick={() => setShowTeamForm((s) => !s)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
            >
              <Plus size={14} /> Invite teammate
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Add PM, Contributor, or Viewer logins for people at {org.name} — no need to ask Keel support.
            Only a Keel administrator can create another account owner.
          </p>

          {showTeamForm && (
            <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input placeholder="Full name" value={teamForm.name} onChange={(e) => setTeamForm((f) => ({ ...f, name: e.target.value }))} className={teamInputCls} />
                <input placeholder="Email" type="email" value={teamForm.email} onChange={(e) => setTeamForm((f) => ({ ...f, email: e.target.value }))} className={teamInputCls} />
                <input placeholder="Temporary password" value={teamForm.password} onChange={(e) => setTeamForm((f) => ({ ...f, password: e.target.value }))} className={teamInputCls} />
                <select value={teamForm.role} onChange={(e) => setTeamForm((f) => ({ ...f, role: e.target.value }))} className={teamInputCls}>
                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {teamError && <p className="text-xs text-rose-600">{teamError}</p>}
              <button onClick={inviteTeamMember} disabled={teamSaving} className="px-3.5 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {teamSaving ? "Inviting..." : "Invite"}
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Division</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {team.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">{u.name}</td>
                  <td className="py-2.5 text-slate-600">{u.email}</td>
                  <td className="py-2.5">
                    <select
                      value={u.role}
                      onChange={(e) => updateTeamRole(u.id, e.target.value)}
                      className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                    >
                      {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5">
                    <select
                      value={u.divisionId ?? ""}
                      onChange={(e) => updateTeamDivision(u.id, e.target.value)}
                      className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                    >
                      <option value="">Unassigned</option>
                      {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => removeTeamMember(u.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {team.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">No teammates yet — invite one above.</td></tr>
              )}
            </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-1">Divisions</p>
          <p className="text-xs text-slate-500 mb-4">
            Departments or business units at {org.name} — used to organize your team and to tag project sponsors.
          </p>
          <div className="flex items-center gap-2 mb-4">
            <input
              placeholder="e.g. Finance, Operations"
              value={newDivisionName}
              onChange={(e) => setNewDivisionName(e.target.value)}
              className={teamInputCls}
            />
            <button
              onClick={addDivision}
              disabled={divisionSaving || !newDivisionName.trim()}
              className="shrink-0 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100 disabled:opacity-50"
            >
              {divisionSaving ? "Adding..." : "+ Add division"}
            </button>
          </div>
          {divisionError && <p className="text-xs text-rose-600 mb-2">{divisionError}</p>}
          <div className="flex flex-wrap gap-2">
            {divisions.map((d) => (
              <span key={d.id} className="inline-flex items-center gap-1.5 text-xs bg-slate-100 text-slate-700 rounded-full px-3 py-1.5">
                {d.name}
                <button onClick={() => removeDivision(d.id)} className="text-slate-400 hover:text-rose-600">
                  <Trash2 size={11} />
                </button>
              </span>
            ))}
            {divisions.length === 0 && <p className="text-xs text-slate-400">No divisions yet.</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-slate-900">Stakeholders (project sponsors)</p>
            <button
              onClick={() => setShowStakeholderForm((s) => !s)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
            >
              <Plus size={14} /> Add stakeholder
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Business stakeholders at {org.name} who can be picked as a project&apos;s sponsor — they don&apos;t
            need a Keel login of their own.
          </p>

          {showStakeholderForm && (
            <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input placeholder="Full name" value={stakeholderForm.name} onChange={(e) => setStakeholderForm((f) => ({ ...f, name: e.target.value }))} className={teamInputCls} />
                <input placeholder="Title (optional)" value={stakeholderForm.title} onChange={(e) => setStakeholderForm((f) => ({ ...f, title: e.target.value }))} className={teamInputCls} />
                <input placeholder="Email (optional)" type="email" value={stakeholderForm.email} onChange={(e) => setStakeholderForm((f) => ({ ...f, email: e.target.value }))} className={teamInputCls} />
                <select value={stakeholderForm.divisionId} onChange={(e) => setStakeholderForm((f) => ({ ...f, divisionId: e.target.value }))} className={teamInputCls}>
                  <option value="">No division</option>
                  {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              {stakeholderError && <p className="text-xs text-rose-600">{stakeholderError}</p>}
              <button onClick={addStakeholder} disabled={stakeholderSaving} className="px-3.5 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {stakeholderSaving ? "Adding..." : "Add stakeholder"}
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Title</th>
                <th className="py-2 font-medium">Division</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {stakeholders.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">{s.name}</td>
                  <td className="py-2.5 text-slate-600">{s.title ?? "—"}</td>
                  <td className="py-2.5">
                    <select
                      value={s.divisionId ?? ""}
                      onChange={(e) => updateStakeholderDivision(s.id, e.target.value)}
                      className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                    >
                      <option value="">No division</option>
                      {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => removeStakeholder(s.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {stakeholders.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-slate-400">No stakeholders yet — add one above.</td></tr>
              )}
            </tbody>
            </table>
          </div>
        </div>

        <RateCardSection title={`${org.name} rate card`} />

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-1">Export your data</p>
          <p className="text-xs text-slate-500 mb-4">
            Download every project, task, and record tied to {org.name} as a single JSON file.
          </p>
          <button
            onClick={exportData}
            disabled={exporting}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {exporting ? "Preparing export..." : "Export my organization's data (JSON)"}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-rose-200 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-1">Delete your organization&apos;s data</p>
          <p className="text-xs text-slate-500 mb-4">
            This permanently deletes every project, task, and record tied to {org.name}, and removes all
            of your organization&apos;s user accounts. It does not happen immediately — a Keel administrator
            reviews and confirms the request before anything is deleted, so there&apos;s no accidental loss.
          </p>

          {org.deletionRequestedAt ? (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-amber-900 font-medium">
                  Deletion requested {new Date(org.deletionRequestedAt).toLocaleString()}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Requested by {org.deletionRequestedBy}. Pending admin review — nothing has been deleted yet.
                </p>
                <button
                  onClick={cancelDeletion}
                  disabled={requesting}
                  className="mt-2 text-xs font-medium text-amber-900 underline hover:no-underline disabled:opacity-50"
                >
                  Cancel this request
                </button>
              </div>
            </div>
          ) : showConfirm ? (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-2">
              <p className="text-xs text-rose-900">
                Are you sure? This will ask an administrator to permanently delete all of {org.name}&apos;s
                data. This cannot be undone once confirmed.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={requestDeletion}
                  disabled={requesting}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 disabled:opacity-50"
                >
                  {requesting ? "Submitting..." : "Yes, request deletion"}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="px-3.5 py-2 rounded-lg border border-rose-300 text-rose-600 text-sm font-medium hover:bg-rose-50"
            >
              Request deletion of our data
            </button>
          )}
          {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  );
}
