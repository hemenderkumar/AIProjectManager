"use client";
import { useEffect, useState, use as usePromise } from "react";
import Topbar from "@/components/Topbar";
import { Plus, Trash2, ShieldCheck, ShieldX, Clock, KeyRound } from "lucide-react";
import AiEditChat from "@/components/project/AiEditChat";

type Organization = {
  id: string;
  name: string;
  orgType: "CLIENT" | "VENDOR";
  companyProfile: string | null;
  taxId: string | null;
  primaryCountry: string | null;
  verificationStatus: string;
  ssoEnabled: boolean;
  samlIdpMetadataUrl: string | null;
  headline: string | null;
  categories: string[] | null;
  skills: string[] | null;
  priceBandMin: number | null;
  priceBandMax: number | null;
  portfolioUrl: string | null;
  logoUrl: string | null;
  publicSlug: string | null;
};
type Member = { id: string; role: string; userId: string; name: string; email: string };
type ComplianceRecord = { id: string; type: string; status: string; notes: string | null; expiresAt: string | null };
type Me = { isPlatform: boolean; memberships: { scOrganizationId: string | null; role: string }[] };

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";
const CLIENT_ROLES = ["CLIENT_ORG_ADMIN", "CLIENT_REQUESTER", "CLIENT_FINANCE_APPROVER"];
const VENDOR_ROLES = ["VENDOR_ORG_ADMIN", "VENDOR_CONTRIBUTOR"];
const COMPLIANCE_TYPES = ["KYC", "KYB", "SANCTIONS_SCREENING", "TAX_FORM"];

export default function KeelConnectOrgDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = usePromise(params);
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [compliance, setCompliance] = useState<ComplianceRecord[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [memberForm, setMemberForm] = useState({ email: "", role: "" });
  const [memberSaving, setMemberSaving] = useState(false);
  const [complianceType, setComplianceType] = useState(COMPLIANCE_TYPES[0]);
  const [complianceSaving, setComplianceSaving] = useState(false);
  const [ssoMetadataUrl, setSsoMetadataUrl] = useState("");
  const [ssoSaving, setSsoSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    headline: "",
    categories: "",
    skills: "",
    priceBandMin: "",
    priceBandMax: "",
    portfolioUrl: "",
    logoUrl: "",
  });
  const [slugInput, setSlugInput] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [orgRes, membersRes, complianceRes, meRes] = await Promise.all([
      fetch(`/api/keelconnect/organizations/${orgId}`),
      fetch(`/api/keelconnect/organizations/${orgId}/members`),
      fetch(`/api/keelconnect/organizations/${orgId}/compliance`),
      fetch("/api/keelconnect/me"),
    ]);
    if (orgRes.ok) {
      const orgData = await orgRes.json();
      setOrg(orgData);
      setSsoMetadataUrl(orgData.samlIdpMetadataUrl ?? "");
      setProfileForm({
        headline: orgData.headline ?? "",
        categories: (orgData.categories ?? []).join(", "),
        skills: (orgData.skills ?? []).join(", "),
        priceBandMin: orgData.priceBandMin != null ? String(orgData.priceBandMin) : "",
        priceBandMax: orgData.priceBandMax != null ? String(orgData.priceBandMax) : "",
        portfolioUrl: orgData.portfolioUrl ?? "",
        logoUrl: orgData.logoUrl ?? "",
      });
    }
    if (membersRes.ok) setMembers(await membersRes.json());
    if (complianceRes.ok) setCompliance(await complianceRes.json());
    if (meRes.ok) setMe(await meRes.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [orgId]);

  const myRolesHere = me?.memberships.filter((m) => m.scOrganizationId === orgId).map((m) => m.role) ?? [];
  const isOrgAdmin = myRolesHere.includes("CLIENT_ORG_ADMIN") || myRolesHere.includes("VENDOR_ORG_ADMIN") || !!me?.isPlatform;
  const isPlatformCompliance = !!me?.isPlatform;
  const availableRoles = org?.orgType === "CLIENT" ? CLIENT_ROLES : VENDOR_ROLES;

  async function addMember() {
    if (!memberForm.email.trim() || !memberForm.role) return;
    setMemberSaving(true);
    setError(null);
    const res = await fetch(`/api/keelconnect/organizations/${orgId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(memberForm),
    });
    setMemberSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not add member.");
      return;
    }
    setMemberForm({ email: "", role: "" });
    load();
  }

  async function removeMember(memberId: string) {
    await fetch(`/api/keelconnect/organizations/${orgId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    load();
  }

  async function submitCompliance() {
    setComplianceSaving(true);
    await fetch(`/api/keelconnect/organizations/${orgId}/compliance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: complianceType }),
    });
    setComplianceSaving(false);
    load();
  }

  async function saveSso(patch: { ssoEnabled?: boolean; samlIdpMetadataUrl?: string | null }) {
    setSsoSaving(true);
    await fetch(`/api/keelconnect/organizations/${orgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSsoSaving(false);
    load();
  }

  async function saveProfile() {
    setProfileSaving(true);
    await fetch(`/api/keelconnect/organizations/${orgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headline: profileForm.headline || null,
        categories: profileForm.categories.trim() ? profileForm.categories.split(",").map((s) => s.trim()).filter(Boolean) : null,
        skills: profileForm.skills.trim() ? profileForm.skills.split(",").map((s) => s.trim()).filter(Boolean) : null,
        priceBandMin: profileForm.priceBandMin ? Number(profileForm.priceBandMin) : null,
        priceBandMax: profileForm.priceBandMax ? Number(profileForm.priceBandMax) : null,
        portfolioUrl: profileForm.portfolioUrl || null,
        logoUrl: profileForm.logoUrl || null,
      }),
    });
    setProfileSaving(false);
    load();
  }

  async function claimSlug() {
    if (!slugInput.trim()) return;
    setProfileSaving(true);
    await fetch(`/api/keelconnect/organizations/${orgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicSlug: slugInput.trim() }),
    });
    setProfileSaving(false);
    load();
  }

  async function decideCompliance(recordId: string, status: "VERIFIED" | "REJECTED") {
    await fetch(`/api/keelconnect/compliance/${recordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function decideOrgVerification(status: "VERIFIED" | "REJECTED" | "PENDING") {
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
        <Topbar title="Organization" />
        <div className="p-8 text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!org) {
    return (
      <div>
        <Topbar title="Organization" />
        <div className="p-8 text-sm text-slate-400">Not found, or you don&apos;t have access to it.</div>
      </div>
    );
  }

  return (
    <div>
      <Topbar title={org.name} subtitle={`${org.orgType === "CLIENT" ? "Client" : "Vendor"} organization`} />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-900">Profile</p>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  org.verificationStatus === "VERIFIED"
                    ? "bg-emerald-50 text-emerald-700"
                    : org.verificationStatus === "REJECTED"
                    ? "bg-rose-50 text-rose-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {org.verificationStatus}
              </span>
              {me?.isPlatform && org.verificationStatus !== "VERIFIED" && (
                <button onClick={() => decideOrgVerification("VERIFIED")} className="text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                  Verify org
                </button>
              )}
              {me?.isPlatform && org.verificationStatus !== "REJECTED" && (
                <button onClick={() => decideOrgVerification("REJECTED")} className="text-xs px-2 py-1 rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100">
                  Reject
                </button>
              )}
              {me?.isPlatform && org.verificationStatus !== "PENDING" && (
                <button onClick={() => decideOrgVerification("PENDING")} className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">
                  Reset
                </button>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-400">Primary country</dt><dd className="text-slate-800">{org.primaryCountry ?? "—"}</dd></div>
            <div><dt className="text-xs text-slate-400">Tax ID</dt><dd className="text-slate-800">{org.taxId ?? "—"}</dd></div>
          </dl>
          {org.companyProfile && <p className="text-xs text-slate-600 mt-3">{org.companyProfile}</p>}
          {me?.isPlatform && (
            <p className="text-xs text-slate-400 mt-3">
              This is the overall org determination a Platform Admin/Compliance Officer makes after reviewing
              the compliance records below — it does not update automatically.
            </p>
          )}
          {isOrgAdmin && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <AiEditChat
                entityType="scOrganization"
                entityId={org.id}
                onApplied={() => load()}
                placeholder='e.g. "we are based in Germany now, update the profile to mention our EU data residency"'
              />
            </div>
          )}
        </div>

        {org.orgType === "VENDOR" && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Public marketplace profile</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Shown to Clients in Vendor discovery search — categories, skills, and price band drive whether you turn up in a filtered search.
              </p>
            </div>
            {isOrgAdmin ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    placeholder="Headline (e.g. Senior React & Node.js contractors)"
                    value={profileForm.headline}
                    onChange={(e) => setProfileForm((f) => ({ ...f, headline: e.target.value }))}
                    className={`${inputCls} sm:col-span-2`}
                  />
                  <input
                    placeholder="Categories (comma separated)"
                    value={profileForm.categories}
                    onChange={(e) => setProfileForm((f) => ({ ...f, categories: e.target.value }))}
                    className={inputCls}
                  />
                  <input
                    placeholder="Skills (comma separated)"
                    value={profileForm.skills}
                    onChange={(e) => setProfileForm((f) => ({ ...f, skills: e.target.value }))}
                    className={inputCls}
                  />
                  <input
                    placeholder="Price band min ($/hr)"
                    type="number"
                    value={profileForm.priceBandMin}
                    onChange={(e) => setProfileForm((f) => ({ ...f, priceBandMin: e.target.value }))}
                    className={inputCls}
                  />
                  <input
                    placeholder="Price band max ($/hr)"
                    type="number"
                    value={profileForm.priceBandMax}
                    onChange={(e) => setProfileForm((f) => ({ ...f, priceBandMax: e.target.value }))}
                    className={inputCls}
                  />
                  <input
                    placeholder="Portfolio URL"
                    value={profileForm.portfolioUrl}
                    onChange={(e) => setProfileForm((f) => ({ ...f, portfolioUrl: e.target.value }))}
                    className={inputCls}
                  />
                  <input
                    placeholder="Logo URL"
                    value={profileForm.logoUrl}
                    onChange={(e) => setProfileForm((f) => ({ ...f, logoUrl: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <button
                  onClick={saveProfile}
                  disabled={profileSaving}
                  className="px-3 py-1.5 rounded-lg bg-accent-600 text-white text-xs font-medium hover:bg-accent-700 disabled:opacity-50"
                >
                  {profileSaving ? "Saving..." : "Save profile"}
                </button>

                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-700 mb-1">Public profile link</p>
                  {org.publicSlug ? (
                    <p className="text-xs text-slate-500">
                      Live at <span className="font-mono text-accent-700">/marketplace/vendors/{org.publicSlug}</span> — visible to anyone, no login required.
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="choose-a-url-slug"
                        value={slugInput}
                        onChange={(e) => setSlugInput(e.target.value)}
                        className={inputCls}
                      />
                      <button
                        onClick={claimSlug}
                        disabled={profileSaving || !slugInput.trim()}
                        className="shrink-0 px-3 py-2 rounded-lg bg-accent-50 text-accent-600 text-xs font-medium hover:bg-accent-100 disabled:opacity-50"
                      >
                        Publish
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Once set, this can&apos;t be changed — pick something you&apos;re happy sharing publicly.</p>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">{org.headline || "No public headline set yet."}</p>
            )}
          </div>
        )}

        {isOrgAdmin && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
            <p className="text-sm font-semibold text-slate-900 mb-1">Members</p>
            <p className="text-xs text-slate-500 mb-4">
              Grant a role to an existing Keel account (they must already have a Keel login).
            </p>
            <div className="flex gap-2 mb-4">
              <input placeholder="Email" value={memberForm.email} onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
              <select value={memberForm.role} onChange={(e) => setMemberForm((f) => ({ ...f, role: e.target.value }))} className={inputCls}>
                <option value="">Select role</option>
                {availableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={addMember} disabled={memberSaving} className="shrink-0 px-3 py-2 rounded-lg bg-accent-50 text-accent-600 text-xs font-medium hover:bg-accent-100 disabled:opacity-50">
                {memberSaving ? "Adding..." : "+ Add"}
              </button>
            </div>
            {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-slate-800">{m.name}</p>
                    <p className="text-xs text-slate-400">{m.email} · {m.role}</p>
                  </div>
                  <button onClick={() => removeMember(m.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button>
                </div>
              ))}
              {members.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No members yet.</p>}
            </div>
          </div>
        )}

        {isOrgAdmin && org.orgType === "CLIENT" && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-900 flex items-center gap-2"><KeyRound size={16} className="text-slate-400" /> Enterprise SSO (SAML)</p>
            <p className="text-xs text-slate-500">
              Give your IT team the metadata URL below to configure this org as a Service Provider in
              your identity provider (Okta, Azure AD, etc.), then paste your IdP&apos;s metadata URL here.
              Note: this is a newly built integration — test it with your IdP before relying on it.
            </p>
            <div className="text-xs text-slate-500 space-y-1 bg-slate-50 rounded-lg p-3">
              <p><span className="font-medium text-slate-700">SP entity ID / metadata:</span> /api/keelconnect/saml/metadata</p>
              <p><span className="font-medium text-slate-700">ACS URL:</span> /api/keelconnect/saml/acs</p>
              <p><span className="font-medium text-slate-700">Login URL:</span> /api/keelconnect/saml/login/{orgId}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                placeholder="Your IdP's metadata URL"
                value={ssoMetadataUrl}
                onChange={(e) => setSsoMetadataUrl(e.target.value)}
                className={inputCls}
              />
              <button
                onClick={() => saveSso({ samlIdpMetadataUrl: ssoMetadataUrl || null })}
                disabled={ssoSaving}
                className="shrink-0 px-3 py-2 rounded-lg bg-accent-50 text-accent-600 text-xs font-medium hover:bg-accent-100 disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-600">SSO enabled</p>
              <button
                onClick={() => saveSso({ ssoEnabled: !org.ssoEnabled })}
                disabled={ssoSaving || !org.samlIdpMetadataUrl}
                className={`text-xs font-medium px-2.5 py-1 rounded-full disabled:opacity-40 ${
                  org.ssoEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {org.ssoEnabled ? "On" : "Off"}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-1">Compliance</p>
          <p className="text-xs text-slate-500 mb-4">KYC/KYB, sanctions screening, and tax forms.</p>
          {isOrgAdmin && (
            <div className="flex gap-2 mb-4">
              <select value={complianceType} onChange={(e) => setComplianceType(e.target.value)} className={inputCls}>
                {COMPLIANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={submitCompliance} disabled={complianceSaving} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-50 text-accent-600 text-xs font-medium hover:bg-accent-100 disabled:opacity-50">
                <Plus size={13} /> {complianceSaving ? "Submitting..." : "Submit record"}
              </button>
            </div>
          )}
          <div className="space-y-2">
            {compliance.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  {c.status === "VERIFIED" ? <ShieldCheck size={15} className="text-emerald-500" /> : c.status === "REJECTED" ? <ShieldX size={15} className="text-rose-500" /> : <Clock size={15} className="text-amber-500" />}
                  <div>
                    <p className="font-medium text-slate-800">{c.type.replace(/_/g, " ")}</p>
                    <p className="text-xs text-slate-400">{c.status}</p>
                  </div>
                </div>
                {isPlatformCompliance && c.status === "PENDING" && (
                  <div className="flex gap-1.5">
                    <button onClick={() => decideCompliance(c.id, "VERIFIED")} className="text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Verify</button>
                    <button onClick={() => decideCompliance(c.id, "REJECTED")} className="text-xs px-2 py-1 rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100">Reject</button>
                  </div>
                )}
              </div>
            ))}
            {compliance.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No compliance records yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
