"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ShieldCheck, ShieldX, Building2 } from "lucide-react";

type ComplianceRow = { id: string; type: string; status: string; scOrganizationId: string; organizationName: string };
type Organization = { id: string; name: string; orgType: string; verificationStatus: string };
type Dispute = { id: string; description: string; status: string };

export default function KeelConnectAdminPage() {
  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

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
              <div key={o.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <Link href={`/keelconnect/organizations/${o.id}`} className="flex items-center gap-2 hover:text-accent-600">
                  <Building2 size={14} className="text-slate-400" /> {o.name}
                  <span className="text-xs text-slate-400">{o.orgType} · {o.verificationStatus}</span>
                </Link>
                {o.verificationStatus !== "VERIFIED" && (
                  <div className="flex gap-1.5">
                    <button onClick={() => decideOrg(o.id, "VERIFIED")} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                      <ShieldCheck size={12} /> Verify org
                    </button>
                    <button onClick={() => decideOrg(o.id, "REJECTED")} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100">
                      <ShieldX size={12} /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
