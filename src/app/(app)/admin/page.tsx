"use client";
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { Plus, Trash2, Download, AlertTriangle, ScrollText, Activity, Check, X, UserPlus, DollarSign, KeyRound, Bug, BookOpen, Power } from "lucide-react";
import RateCardSection from "@/components/RateCardSection";
import AiEditChat from "@/components/project/AiEditChat";

type User = { id: string; name: string; email: string; role: string; organizationId: string | null; resourceId: string | null };
type Resource = { id: string; name: string };
type Organization = {
  id: string;
  name: string;
  isActive: boolean;
  deletionRequestedAt: string | null;
  deletionRequestedBy: string | null;
};
type Settings = { weeklyReportCadence: string; steeringCadence: string; avatarVoiceGender: string };
type Registration = {
  id: string;
  type: "INDIVIDUAL" | "COMPANY_OWNER";
  name: string;
  email: string;
  companyName: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  resultingUserId: string | null;
  requestedAt: string;
};

const ROLES = ["ADMIN", "SUPER_USER", "PM", "CONTRIBUTOR", "VIEWER"];

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "CONTRIBUTOR", organizationId: "" });
  const [sendSetupLink, setSendSetupLink] = useState(true);
  const [orgActionId, setOrgActionId] = useState<string | null>(null);
  const [confirmDeleteOrgId, setConfirmDeleteOrgId] = useState<string | null>(null);
  const [orgDeleteError, setOrgDeleteError] = useState<string | null>(null);
  const [ratesOrgId, setRatesOrgId] = useState<string | null>(null);

  const [resources, setResources] = useState<Resource[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [regActionId, setRegActionId] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);

  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: "", ownerName: "", ownerEmail: "", ownerPassword: "" });
  const [companySaving, setCompanySaving] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);

  async function load() {
    const [u, s, o, reg, res] = await Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/settings").then((r) => r.json()),
      fetch("/api/admin/organizations").then((r) => r.json()),
      fetch("/api/admin/registrations").then((r) => r.json()),
      fetch("/api/resources").then((r) => (r.ok ? r.json() : [])),
    ]);
    setUsers(Array.isArray(u) ? u : []);
    setSettings(s);
    setOrgs(Array.isArray(o) ? o : []);
    setRegistrations(Array.isArray(reg) ? reg : []);
    setResources(Array.isArray(res) ? res : []);
  }

  const pendingRegistrations = registrations.filter((r) => r.status === "PENDING");

  async function approveRegistration(id: string) {
    setRegActionId(id);
    setRegError(null);
    const res = await fetch(`/api/admin/registrations/${id}/approve`, { method: "POST" });
    setRegActionId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setRegError(data?.error ?? "Could not approve this request.");
      return;
    }
    load();
  }

  async function rejectRegistration(reg: Registration) {
    const confirmText = reg.resultingUserId
      ? "This person already has an active account — reject will disable their login immediately. Continue?"
      : "Reject this registration request? They won't be able to log in.";
    if (!confirm(confirmText)) return;
    setRegActionId(reg.id);
    setRegError(null);
    const res = await fetch(`/api/admin/registrations/${reg.id}/reject`, { method: "POST" });
    setRegActionId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setRegError(data?.error ?? "Could not reject this request.");
      return;
    }
    load();
  }

  async function createCompany() {
    if (!companyForm.name.trim() || !companyForm.ownerName.trim() || !companyForm.ownerEmail.trim() || !companyForm.ownerPassword.trim()) {
      setCompanyError("Company name and owner name/email/password are all required.");
      return;
    }
    setCompanySaving(true);
    setCompanyError(null);
    const res = await fetch("/api/admin/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: companyForm.name,
        ownerName: companyForm.ownerName,
        ownerEmail: companyForm.ownerEmail,
        ownerPassword: companyForm.ownerPassword,
      }),
    });
    setCompanySaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 207) {
      setCompanyError(data?.error ?? "Could not create the company.");
      return;
    }
    if (data.organization) setOrgs((prev) => [data.organization, ...prev]);
    if (data.error) {
      // Partial success (HTTP 207): the company was created but the owner account wasn't —
      // surface that instead of pretending everything worked.
      setCompanyError(data.error);
    } else {
      setShowCompanyForm(false);
      setCompanyForm({ name: "", ownerName: "", ownerEmail: "", ownerPassword: "" });
    }
    load();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function createUser() {
    if (!form.name || !form.email) return;
    if (!sendSetupLink && !form.password) return;
    if (form.role === "SUPER_USER" && !form.organizationId) {
      alert("A SUPER_USER must be assigned to an organization.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        password: sendSetupLink ? undefined : form.password,
        organizationId: form.organizationId || null,
      }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data?.error ?? "Could not create user.");
      return;
    }
    if (sendSetupLink) {
      alert(
        data.emailed
          ? `${data.name} was created — a setup link was emailed to ${data.email}.`
          : `${data.name} was created, but the email wasn't sent (no email service configured). Share this link with them directly:\n\n${data.setupLink}`
      );
    }
    setShowForm(false);
    setForm({ name: "", email: "", password: "", role: "CONTRIBUTOR", organizationId: "" });
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

  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);

  async function resetPassword(u: User) {
    setResetPasswordId(u.id);
    const res = await fetch(`/api/admin/users/${u.id}/reset-password`, { method: "POST" });
    setResetPasswordId(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data?.error ?? "Could not start a password reset.");
      return;
    }
    if (data.emailed) {
      alert(`Reset link emailed to ${u.email}.`);
    } else {
      // No RESEND_API_KEY configured (or the send failed) -- fall back to sharing the link
      // directly, same as the status-request flow does.
      alert(`Email wasn't sent (no email service configured). Share this link with ${u.name} directly:\n\n${data.link}`);
    }
  }

  async function updateResource(id: string, resourceId: string) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId: resourceId || null }),
    });
    load();
  }

  async function updateOrg(id: string, organizationId: string) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: organizationId || null }),
    });
    load();
  }

  async function removeUser(id: string) {
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    load();
  }

  async function exportOrg(id: string) {
    setOrgActionId(id);
    try {
      const res = await fetch(`/api/admin/organizations/${id}/export`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const org = orgs.find((o) => o.id === id);
      a.download = `${(org?.name ?? "organization").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setOrgActionId(null);
    }
  }

  async function confirmDeletion(id: string) {
    if (!confirm("Permanently delete this organization and all of its projects, tasks, and users? This cannot be undone.")) return;
    setOrgActionId(id);
    const res = await fetch(`/api/admin/organizations/${id}/confirm-deletion`, { method: "POST" });
    setOrgActionId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "Could not delete organization.");
      return;
    }
    load();
  }

  async function dismissDeletion(id: string) {
    setOrgActionId(id);
    await fetch(`/api/admin/organizations/${id}/dismiss-deletion`, { method: "POST" });
    setOrgActionId(null);
    load();
  }

  async function toggleActive(o: Organization) {
    setOrgActionId(o.id);
    const res = await fetch(`/api/admin/organizations/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !o.isActive }),
    });
    setOrgActionId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setOrgDeleteError(data?.error ?? "Could not update this company.");
      return;
    }
    load();
  }

  async function deleteOrgDirectly(id: string) {
    setOrgActionId(id);
    setOrgDeleteError(null);
    const res = await fetch(`/api/admin/organizations/${id}`, { method: "DELETE" });
    setOrgActionId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setOrgDeleteError(data?.error ?? "Could not delete this company.");
      return;
    }
    setConfirmDeleteOrgId(null);
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
      <Topbar
        title="Admin"
        subtitle="Manage users, roles, and automation settings"
        action={
          <div className="flex items-center gap-2">
            <Link href="/admin/activity" className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              <Activity size={14} /> User Activity
            </Link>
            <Link href="/admin/audit-log" className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              <ScrollText size={14} /> Audit Log
            </Link>
            <Link href="/admin/issues" className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              <Bug size={14} /> Issue Reports
            </Link>
            <Link href="/admin/documentation" className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              <BookOpen size={14} /> Documentation
            </Link>
          </div>
        }
      />
      <div className="p-8 max-w-3xl space-y-6">

        {pendingRegistrations.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <UserPlus size={16} className="text-accent-600" /> Pending Registrations ({pendingRegistrations.length})
              </p>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Individuals are auto-provisioned and can already log in — they can&apos;t see
              anyone else&apos;s data until added to a project, so this list is for visibility
              and catching anything that looks wrong, not a gate. Company-owner requests are
              still fully gated: nothing is created (no organization, no login) until you
              approve. Add anyone to specific projects from that project&apos;s Team access section.
            </p>
            {regError && <p className="text-xs text-rose-600 mb-3">{regError}</p>}
            <div className="space-y-2">
              {pendingRegistrations.map((r) => (
                <div key={r.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {r.name}{" "}
                      <span className="text-xs font-normal text-slate-400">
                        ({r.type === "COMPANY_OWNER" ? `company owner — ${r.companyName}` : "individual"})
                      </span>{" "}
                      {r.resultingUserId ? (
                        <span className="text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">Active — can log in</span>
                      ) : (
                        <span className="text-xs font-medium bg-amber-50 text-amber-700 rounded-full px-2 py-0.5">No login yet</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {r.email} · requested {new Date(r.requestedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => approveRegistration(r.id)}
                      disabled={regActionId === r.id}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      <Check size={13} /> {r.resultingUserId ? "Confirm" : "Approve"}
                    </button>
                    <button
                      onClick={() => rejectRegistration(r)}
                      disabled={regActionId === r.id}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    >
                      <X size={13} /> {r.resultingUserId ? "Disable" : "Reject"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-900">Organizations</p>
            <button
              onClick={() => setShowCompanyForm((s) => !s)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
            >
              <Plus size={14} /> New Company
            </button>
          </div>

          {showCompanyForm && (
            <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
              <p className="text-xs text-slate-500">
                Creates the client company and its first account owner (SUPER_USER) together —
                the owner logs in to manage their own team, divisions, stakeholders, and vendor
                evaluations.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  placeholder="Company name"
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
                  className={`${inputCls} col-span-2`}
                />
                <input
                  placeholder="Owner full name"
                  value={companyForm.ownerName}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, ownerName: e.target.value }))}
                  className={inputCls}
                />
                <input
                  placeholder="Owner email"
                  type="email"
                  value={companyForm.ownerEmail}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                  className={inputCls}
                />
                <input
                  placeholder="Owner temporary password"
                  value={companyForm.ownerPassword}
                  onChange={(e) => setCompanyForm((f) => ({ ...f, ownerPassword: e.target.value }))}
                  className={`${inputCls} col-span-2`}
                />
              </div>
              {companyError && <p className="text-xs text-rose-600">{companyError}</p>}
              <button
                onClick={createCompany}
                disabled={companySaving}
                className="px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
              >
                {companySaving ? "Creating..." : "Create Company & Owner"}
              </button>
            </div>
          )}

          {orgDeleteError && <p className="text-xs text-rose-600 mb-3">{orgDeleteError}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <Fragment key={o.id}>
                <tr className={`border-b border-slate-50 last:border-0 ${o.isActive ? "" : "opacity-60"}`}>
                  <td className="py-2.5 font-medium text-slate-800">{o.name}</td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!o.isActive && (
                        <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">Disabled</span>
                      )}
                      {o.deletionRequestedAt ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                          <AlertTriangle size={12} />
                          Deletion requested by {o.deletionRequestedBy ?? "unknown"} on {new Date(o.deletionRequestedAt).toLocaleDateString()}
                        </span>
                      ) : o.isActive ? (
                        <span className="text-xs text-slate-400">Active</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2.5 text-right space-x-3">
                    <button
                      onClick={() => toggleActive(o)}
                      disabled={orgActionId === o.id}
                      className={`text-xs font-medium disabled:opacity-50 inline-flex items-center gap-1 ${
                        o.isActive ? "text-slate-500 hover:text-amber-600" : "text-slate-500 hover:text-emerald-600"
                      }`}
                    >
                      <Power size={13} /> {o.isActive ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => setRatesOrgId(ratesOrgId === o.id ? null : o.id)}
                      className={`text-xs font-medium disabled:opacity-50 inline-flex items-center gap-1 ${
                        ratesOrgId === o.id ? "text-accent-600" : "text-slate-500 hover:text-accent-600"
                      }`}
                    >
                      <DollarSign size={13} /> Rates
                    </button>
                    <button
                      onClick={() => exportOrg(o.id)}
                      disabled={orgActionId === o.id}
                      className="text-xs font-medium text-slate-500 hover:text-accent-600 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <Download size={13} /> Export
                    </button>
                    {o.deletionRequestedAt ? (
                      <>
                        <button
                          onClick={() => dismissDeletion(o.id)}
                          disabled={orgActionId === o.id}
                          className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                        <button
                          onClick={() => confirmDeletion(o.id)}
                          disabled={orgActionId === o.id}
                          className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
                        >
                          Confirm delete
                        </button>
                      </>
                    ) : confirmDeleteOrgId === o.id ? (
                      <>
                        <span className="text-xs text-slate-500">Delete {o.name} and everything in it?</span>
                        <button
                          onClick={() => deleteOrgDirectly(o.id)}
                          disabled={orgActionId === o.id}
                          className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
                        >
                          {orgActionId === o.id ? "Deleting..." : "Yes, delete"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteOrgId(null)}
                          disabled={orgActionId === o.id}
                          className="text-xs font-medium text-slate-400 hover:text-slate-600 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteOrgId(o.id)}
                        className="text-xs font-medium text-slate-500 hover:text-rose-600 inline-flex items-center gap-1"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                  </td>
                </tr>
                <tr className="border-b border-slate-50 last:border-0">
                  <td colSpan={3} className="pb-2.5 pt-0">
                    <AiEditChat
                      entityType="organization"
                      entityId={o.id}
                      onApplied={() => load()}
                      placeholder='e.g. "disable this company" or "rename it to Acme Holdings"'
                    />
                  </td>
                </tr>
                </Fragment>
              ))}
              {orgs.length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-slate-400">No organizations yet.</td></tr>
              )}
            </tbody>
            </table>
          </div>
          {ratesOrgId && (
            <div className="mt-4">
              <RateCardSection
                organizationId={ratesOrgId}
                title={`${orgs.find((o) => o.id === ratesOrgId)?.name ?? "Company"} rates`}
              />
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-900">Users & roles</p>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
            >
              <Plus size={14} /> Add User
            </button>
          </div>

          {showForm && (
            <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input placeholder="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
                <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inputCls}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select
                  value={form.organizationId}
                  onChange={(e) => setForm((f) => ({ ...f, organizationId: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Internal staff (no organization)</option>
                  {orgs.filter((o) => o.isActive).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              {form.role === "SUPER_USER" && (
                <p className="text-xs text-amber-600">A SUPER_USER must be assigned to an organization above.</p>
              )}
              <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium w-fit">
                <button
                  type="button"
                  onClick={() => setSendSetupLink(true)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${sendSetupLink ? "bg-accent-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  Email them a setup link
                </button>
                <button
                  type="button"
                  onClick={() => setSendSetupLink(false)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${!sendSetupLink ? "bg-accent-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  Set a temporary password
                </button>
              </div>
              {sendSetupLink ? (
                <p className="text-xs text-slate-500">
                  They&apos;ll get an email with a one-time link to choose their own password. Nobody, including you, will know it.
                </p>
              ) : (
                <input placeholder="Temporary password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className={inputCls} />
              )}
              <button onClick={createUser} disabled={saving} className="px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50">
                {saving ? "Creating..." : "Create user"}
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
                <th className="py-2 font-medium">Organization</th>
                <th className="py-2 font-medium">Resource</th>
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
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5">
                    <select
                      value={u.organizationId ?? ""}
                      onChange={(e) => updateOrg(u.id, e.target.value)}
                      className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                    >
                      <option value="">Internal staff</option>
                      {orgs.filter((o) => o.isActive || o.id === u.organizationId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5">
                    <select
                      value={u.resourceId ?? ""}
                      onChange={(e) => updateResource(u.id, e.target.value)}
                      className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                    >
                      <option value="">Not linked</option>
                      {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 text-right space-x-3">
                    <button
                      onClick={() => resetPassword(u)}
                      disabled={resetPasswordId === u.id}
                      className="text-slate-400 hover:text-accent-600 disabled:opacity-50 inline-flex items-center"
                      title="Reset password"
                    >
                      <KeyRound size={15} />
                    </button>
                    <button onClick={() => removeUser(u.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-slate-400">No users yet.</td></tr>
              )}
            </tbody>
            </table>
          </div>
        </div>

        {settings && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
            <p className="text-sm font-semibold text-slate-900 mb-4">Automation settings</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
