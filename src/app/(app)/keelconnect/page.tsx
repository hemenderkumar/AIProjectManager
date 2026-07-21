"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { Building2, Globe2, ArrowRight, Loader2, ShieldAlert } from "lucide-react";

type Organization = { id: string; name: string; orgType: "CLIENT" | "VENDOR"; verificationStatus: string };
type Project = { id: string; title: string; status: string; currency: string; targetBudget: number | null };
type MfaStatus = { mfaEnabled: boolean; mfaRequired: boolean };

export default function KeelConnectHome() {
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);

  useEffect(() => {
    async function load() {
      const [orgsRes, projectsRes, mfaRes] = await Promise.all([
        fetch("/api/keelconnect/organizations"),
        fetch("/api/keelconnect/projects"),
        fetch("/api/keelconnect/mfa/status"),
      ]);
      if (orgsRes.ok) setOrgs(await orgsRes.json());
      if (projectsRes.ok) setProjects(await projectsRes.json());
      if (mfaRes.ok) setMfaStatus(await mfaRes.json());
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div>
        <Topbar title="KeelConnect" subtitle="B2B marketplace for global IT project outsourcing" />
        <div className="p-8 flex items-center gap-2 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <Topbar title="KeelConnect" subtitle="B2B marketplace for global IT project outsourcing" />
      <div className="p-8 max-w-4xl space-y-6">
        {mfaStatus?.mfaRequired && !mfaStatus.mfaEnabled && (
          <Link
            href="/keelconnect/mfa"
            className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 hover:bg-amber-100 transition-colors"
          >
            <ShieldAlert size={16} className="shrink-0" />
            One of your roles requires two-factor authentication — set it up now to keep using it.
            <ArrowRight size={13} className="ml-auto shrink-0" />
          </Link>
        )}

        {orgs.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6 text-center">
            <p className="text-sm font-semibold text-slate-900 mb-1">Get started on KeelConnect</p>
            <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
              Register your company as a Client (to post projects for outsourcing) or a Vendor
              (to bid on work) — it only takes a moment.
            </p>
            <Link
              href="/keelconnect/organizations"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-700"
            >
              Register your organization <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {orgs.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-900">Your organizations</p>
              <Link href="/keelconnect/organizations" className="text-xs text-accent-600 hover:text-accent-700 font-medium">View all</Link>
            </div>
            <div className="space-y-2">
              {orgs.map((o) => (
                <Link
                  key={o.id}
                  href={`/keelconnect/organizations/${o.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-accent-200 hover:bg-accent-50/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Building2 size={16} className="text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{o.name}</p>
                      <p className="text-xs text-slate-400">{o.orgType === "CLIENT" ? "Client" : "Vendor"} organization</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      o.verificationStatus === "VERIFIED"
                        ? "bg-emerald-50 text-emerald-700"
                        : o.verificationStatus === "REJECTED"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {o.verificationStatus}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-900">Marketplace projects</p>
            <Link href="/keelconnect/projects" className="text-xs text-accent-600 hover:text-accent-700 font-medium">Browse all</Link>
          </div>
          <div className="space-y-2">
            {projects.slice(0, 5).map((p) => (
              <Link
                key={p.id}
                href={`/keelconnect/projects/${p.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-accent-200 hover:bg-accent-50/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Globe2 size={16} className="text-slate-400" />
                  <p className="text-sm font-medium text-slate-800">{p.title}</p>
                </div>
                <span className="text-xs font-medium text-slate-500">{p.status}</span>
              </Link>
            ))}
            {projects.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No projects visible yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
