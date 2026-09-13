"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, Copy, Check } from "lucide-react";

type SsoConfig = {
  id: string;
  isEnabled: boolean;
  emailDomain: string;
  idpEntityId: string;
  idpSsoUrl: string;
  idpCertificate: string;
  defaultRole: string;
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500 font-mono";
const DEFAULT_ROLES = ["VIEWER", "CONTRIBUTOR", "PM"];

const emptyForm = { emailDomain: "", idpEntityId: "", idpSsoUrl: "", idpCertificate: "", defaultRole: "VIEWER", isEnabled: false };

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        <input readOnly value={value} className={inputCls} onFocus={(e) => e.target.select()} />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

// Self-fetching, self-contained -- same pattern as RateCardSection. A SUPER_USER wires up their
// company's Identity Provider here: our SP metadata/ACS URL to paste into the IdP's "add
// application" flow, and the IdP's own entity ID / SSO URL / signing certificate to paste back
// here. See lib/sso.ts for what actually happens with these values at login time.
export default function SsoSettingsSection({ title = "Single Sign-On (SAML)" }: { title?: string }) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<SsoConfig | null>(null);
  const [spEntityId, setSpEntityId] = useState("");
  const [acsUrl, setAcsUrl] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/organization/sso");
    if (res.ok) {
      const data = await res.json();
      setSpEntityId(data.spEntityId);
      setAcsUrl(data.acsUrl);
      if (data.config) {
        setConfig(data.config);
        setForm({
          emailDomain: data.config.emailDomain,
          idpEntityId: data.config.idpEntityId,
          idpSsoUrl: data.config.idpSsoUrl,
          idpCertificate: data.config.idpCertificate,
          defaultRole: data.config.defaultRole,
          isEnabled: data.config.isEnabled,
        });
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function save(nextEnabled?: boolean) {
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    const payload = { ...form, isEnabled: nextEnabled ?? form.isEnabled };
    const res = await fetch("/api/organization/sso", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? "Could not save SSO configuration.");
      return;
    }
    setConfig(data.config);
    setForm((f) => ({ ...f, isEnabled: payload.isEnabled }));
    setSavedMessage(payload.isEnabled ? "SSO is now enabled." : "Saved -- SSO is not yet enabled.");
  }

  async function remove() {
    if (!confirm("Remove this SSO configuration? Teammates will go back to logging in with a password.")) return;
    setSaving(true);
    await fetch("/api/organization/sso", { method: "DELETE" });
    setSaving(false);
    setConfig(null);
    setForm(emptyForm);
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
        <p className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
          <ShieldCheck size={15} className="text-accent-600" /> {title}
        </p>
        <p className="text-xs text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          <ShieldCheck size={15} className="text-accent-600" /> {title}
        </p>
        {config && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.isEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {config.isEnabled ? "Enabled" : "Disabled"}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Let your team sign in with your company&apos;s identity provider (Okta, Azure AD/Entra, Google
        Workspace, or any SAML 2.0 IdP) instead of an Executa password.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-3 bg-slate-50 rounded-lg">
        <CopyField label="SP Entity ID (give this to your IdP)" value={spEntityId} />
        <CopyField label="ACS URL / Reply URL (give this to your IdP)" value={acsUrl} />
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Your email domain</label>
            <input
              placeholder="acme.com"
              value={form.emailDomain}
              onChange={(e) => setForm((f) => ({ ...f, emailDomain: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Default role for new SSO sign-ins</label>
            <select
              value={form.defaultRole}
              onChange={(e) => setForm((f) => ({ ...f, defaultRole: e.target.value }))}
              className={inputCls}
            >
              {DEFAULT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Identity Provider Entity ID</label>
          <input
            placeholder="https://your-idp.example.com/saml/metadata"
            value={form.idpEntityId}
            onChange={(e) => setForm((f) => ({ ...f, idpEntityId: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Identity Provider SSO URL</label>
          <input
            placeholder="https://your-idp.example.com/saml/sso"
            value={form.idpSsoUrl}
            onChange={(e) => setForm((f) => ({ ...f, idpSsoUrl: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Identity Provider signing certificate (PEM)</label>
          <textarea
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            value={form.idpCertificate}
            onChange={(e) => setForm((f) => ({ ...f, idpCertificate: e.target.value }))}
            className={inputCls}
            rows={4}
          />
        </div>

        {error && <p className="text-xs text-rose-600">{error}</p>}
        {savedMessage && <p className="text-xs text-emerald-600">{savedMessage}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save & Enable"}
          </button>
          {config && (
            <button
              onClick={remove}
              disabled={saving}
              className="ml-auto text-xs text-slate-400 hover:text-rose-600"
            >
              Remove configuration
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
