"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ShieldCheck, ShieldX, Building2, Power, Trash2 } from "lucide-react";
import AiEditChat from "@/components/project/AiEditChat";

type ComplianceRow = { id: string; type: string; status: string; scOrganizationId: string; organizationName: string };
type Organization = { id: string; name: string; orgType: string; verificationStatus: string; isActive: boolean };
type Dispute = { id: string; description: string; status: string };

export default function KeelConnectAdminPage() {
  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [confirmDeleteOrgId, setConfirmDeleteOrgId] = useState<string | null>(null);
  const [orgActionId, setOrgActionId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [complianceRes, orgsRes, disputesRes] = await Promise.all([
      fetch("/api/keelconnect/admin/compliance"),
      fetch("/api/keelconnect/organizations"),
      fetch("/api/keelconnect/disputes"),
    ]);
    if (complianceRes.status === 403) setForbidden(true);
    if (complianceRes.ok) setCompliance(await complianceRes.json());
    if (orgsRes.ok) setOrgs(await orgsRes.json());
    if (disputesRes.ok) setDisputes(await disputesRes.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function decide(recordId: string, status: "VERIFIED" | "REJECTED") {
    await fetch(`/api/keelconnect/compliance/${recordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function decideOrg(orgId: string, status: "VERIFIED" | "REJECTED") {
    await fetch(`/api/keelconnect/organizations/${orgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationStatus: status }),
    });
    load();
  }

  async function toggleOrgActive(o: Organization) {
    setOrgActionId(o.id);
    await fetch(`/api/keelconnect/organizations/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !o.isActive }),
    });
    setOrgActionId(null);
    load();
  }

  async function deleteOrg(orgId: string) {
    setOrgActionId(orgId);
    const res = await fetch(`/api/keelconnect/organizations/${orgId}`, { method: "DELETE" });
    setOrgActionId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "Could not delete this organization.");
      return;
    }
    setConfirmDeleteOrgId(null);
    load();
  }

  if (loading) {
    return (
      <div>
        <Topbar title="Admin Console" />
        <div className="p-8 text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div>
        <Topbar title="Admin Console" />
        <div className="p-8 text-sm text-slate-400">Platform staff only.</div>
      </div>
    );
  }

  const pendingCompliance = compliance.filter((c) => c.status === "PENDING");
  const openDisputes = disputes.filter((d) => d.status !== "RESOLVED");

  return (
    <div>
      <Topbar title="Admin Console" subtitle="Platform-wide compliance review, disputes, and organizations" />
      <div className="p-8 max-w-4xl space-y-6">
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-3">Compliance queue ({pendingCompliance.length} pending)</p>
          <div className="space-y-2">
            {pendingCompliance.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <div>
                  <p className="font-medium text-slate-800">{c.organizationName}</p>
                  <p className="text-xs text-slate-400">{c.type.replace(/_/g, " ")}</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => decide(c.id, "VERIFIED")} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                    <ShieldCheck size={12} /> Verify
                  </button>
                  <button onClick={() => decide(c.id, "REJECTED")} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100">
                    <ShieldX size={12} /> Reject
                  </button>
                </div>
              </div>
            ))}
            {pendingCompliance.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">Nothing pending review.</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-3">Open disputes ({openDisputes.length})</p>
          <div className="space-y-2">
            {openDisputes.map((d) => (
              <Link key={d.id} href="/keelconnect/disputes" className="block text-sm text-slate-700 border-b border-slate-50 pb-2 last:border-0 hover:text-accent-600">
                {d.description}
              </Link>
            ))}
            {openDisputes.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No open disputes.</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-3">All organizations ({orgs.length})</p>
          <div className="space-y-2">
            {orgs.map((o) => (
              <div key={o.id} className={`border-b border-slate-50 pb-2 last:border-0 ${o.isActive ? "" : "opacity-60"}`}>
                <div className="flex items-center justify-between text-sm">
                  <Link href={`/keelconnect/organizations/${o.id}`} className="flex items-center gap-2 hover:text-accent-600">
                    <Building2 size={14} className="text-slate-400" /> {o.name}
                    <span className="text-xs text-slate-400">
                      {o.orgType} · {o.verificationStatus}
                      {!o.isActive && " · Disabled"}
                    </span>
                  </Link>
                  <div className="flex gap-1.5">
                    {o.verificationStatus !== "VERIFIED" && (
                      <>
                        <button onClick={() => decideOrg(o.id, "VERIFIED")} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                          <ShieldCheck size={12} /> Verify org
                        </button>
                        <button onClick={() => decideOrg(o.id, "REJECTED")} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100">
                          <ShieldX size={12} /> Reject
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => toggleOrgActive(o)}
                      disabled={orgActionId === o.id}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      <Power size={12} /> {o.isActive ? "Disable" : "Enable"}
                    </button>
                    {confirmDeleteOrgId === o.id ? (
                      <>
                        <span className="text-xs text-slate-500 self-center">Delete for good?</span>
                        <button
                          onClick={() => deleteOrg(o.id)}
                          disabled={orgActionId === o.id}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                          {orgActionId === o.id ? "Deleting..." : "Yes, delete"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteOrgId(null)}
                          className="text-xs px-2 py-1 rounded-md text-slate-400 hover:text-slate-600"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteOrgId(o.id)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </div>
                <AiEditChat
                  entityType="scOrganizationAdmin"
                  entityId={o.id}
                  onApplied={() => load()}
                  placeholder='e.g. "verify this org" or "disable this vendor"'
                />
              </div>
            ))}
            {orgs.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No organizations yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
