"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { Plus, Building2 } from "lucide-react";

type Organization = { id: string; name: string; orgType: "CLIENT" | "VENDOR"; verificationStatus: string; primaryCountry: string | null };

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

export default function KeelConnectOrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", orgType: "CLIENT" as "CLIENT" | "VENDOR", primaryCountry: "", taxId: "", companyProfile: "" });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/keelconnect/organizations");
    if (res.ok) setOrgs(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function createOrg() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/keelconnect/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not create organization.");
      return;
    }
    setShowForm(false);
    setForm({ name: "", orgType: "CLIENT", primaryCountry: "", taxId: "", companyProfile: "" });
    load();
  }

  return (
    <div>
      <Topbar
        title="Organizations"
        subtitle="Client and Vendor companies on KeelConnect"
        action={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-accent-600 text-white font-medium hover:bg-accent-700"
          >
            <Plus size={15} /> Register organization
          </button>
        }
      />
      <div className="p-8 max-w-3xl space-y-6">
        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Register a new organization</p>
            <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium w-fit">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, orgType: "CLIENT" }))}
                className={`px-3 py-1.5 rounded-md transition-colors ${form.orgType === "CLIENT" ? "bg-accent-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              >
                Client (posts projects)
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, orgType: "VENDOR" }))}
                className={`px-3 py-1.5 rounded-md transition-colors ${form.orgType === "VENDOR" ? "bg-accent-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              >
                Vendor (bids on work)
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input placeholder="Company name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
              <input placeholder="Primary country" value={form.primaryCountry} onChange={(e) => setForm((f) => ({ ...f, primaryCountry: e.target.value }))} className={inputCls} />
              <input placeholder="Tax ID (optional)" value={form.taxId} onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))} className={inputCls} />
            </div>
            <textarea
              placeholder="Company profile (optional) — what you do, industries served, etc."
              value={form.companyProfile}
              onChange={(e) => setForm((f) => ({ ...f, companyProfile: e.target.value }))}
              className={`${inputCls} min-h-20`}
            />
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              onClick={createOrg}
              disabled={saving || !form.name.trim()}
              className="px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? "Registering..." : "Register"}
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-3">Your organizations</p>
          {loading ? (
            <p className="text-xs text-slate-400">Loading...</p>
          ) : orgs.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No organizations yet — register one above.</p>
          ) : (
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
                      <p className="text-xs text-slate-400">
                        {o.orgType === "CLIENT" ? "Client" : "Vendor"}{o.primaryCountry ? ` · ${o.primaryCountry}` : ""}
                      </p>
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
          )}
        </div>
      </div>
    </div>
  );
}
