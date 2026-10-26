"use client";

import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";

type Org = {
  name: string;
  logoDataUrl: string | null;
  brandColor: string | null;
  brandDisplayName: string | null;
  loginSlug: string | null;
  loginTagline: string | null;
  hidePoweredBy: boolean;
  emailFromName: string | null;
  emailReplyTo: string | null;
};

const inputCls =
  "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

// SUPER_USER settings for the client-facing white-label: display name, branded sign-in address,
// tagline, email sender identity and the "Powered by Executa" footer. Logo + color are edited in
// the Branding card above (shared with the internal theme).
export default function WhiteLabelSection() {
  const [org, setOrg] = useState<Org | null>(null);
  const [form, setForm] = useState({
    brandDisplayName: "",
    loginSlug: "",
    loginTagline: "",
    emailFromName: "",
    emailReplyTo: "",
    hidePoweredBy: false,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/organization")
      .then((r) => (r.ok ? r.json() : null))
      .then((o: Org | null) => {
        if (cancelled || !o) return;
        setOrg(o);
        setForm({
          brandDisplayName: o.brandDisplayName ?? "",
          loginSlug: o.loginSlug ?? "",
          loginTagline: o.loginTagline ?? "",
          emailFromName: o.emailFromName ?? "",
          emailReplyTo: o.emailReplyTo ?? "",
          hidePoweredBy: o.hidePoweredBy,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function save() {
    setSaving(true);
    setMessage(null);
    fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandDisplayName: form.brandDisplayName,
        loginSlug: form.loginSlug,
        loginTagline: form.loginTagline,
        emailFromName: form.emailFromName,
        emailReplyTo: form.emailReplyTo,
        hidePoweredBy: form.hidePoweredBy,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Could not save");
        setMessage({ ok: true, text: "Saved." });
      })
      .catch((e: Error) => setMessage({ ok: false, text: e.message }))
      .finally(() => setSaving(false));
  }

  if (!org) return null;
  const shownName = form.brandDisplayName.trim() || org.name;
  const color = org.brandColor || "#4f46e5";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
      <p className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
        <Globe2 size={15} className="text-accent-600" /> Client portal white-label
      </p>
      <p className="text-xs text-slate-500 mb-4">
        What your clients see: your name and logo on a branded sign-in page, in the portal, and on emails sent on your
        behalf. Upload the logo and pick the color in Branding above.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-slate-600">
          Display name
          <input className={inputCls} placeholder={org.name} value={form.brandDisplayName} onChange={(e) => setForm((f) => ({ ...f, brandDisplayName: e.target.value }))} />
        </label>
        <label className="text-xs text-slate-600">
          Sign-in address
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400 shrink-0">/login?org=</span>
            <input className={inputCls} placeholder="acme" value={form.loginSlug} onChange={(e) => setForm((f) => ({ ...f, loginSlug: e.target.value.toLowerCase() }))} />
          </div>
        </label>
        <label className="text-xs text-slate-600 sm:col-span-2">
          Sign-in tagline
          <input className={inputCls} placeholder="Your project portal" value={form.loginTagline} onChange={(e) => setForm((f) => ({ ...f, loginTagline: e.target.value }))} />
        </label>
        <label className="text-xs text-slate-600">
          Email sender name
          <input className={inputCls} placeholder={shownName} value={form.emailFromName} onChange={(e) => setForm((f) => ({ ...f, emailFromName: e.target.value }))} />
        </label>
        <label className="text-xs text-slate-600">
          Reply-to address
          <input className={inputCls} type="email" placeholder="projects@yourcompany.com" value={form.emailReplyTo} onChange={(e) => setForm((f) => ({ ...f, emailReplyTo: e.target.value }))} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700 mt-4">
        <input type="checkbox" checked={form.hidePoweredBy} onChange={(e) => setForm((f) => ({ ...f, hidePoweredBy: e.target.checked }))} />
        Hide &quot;Powered by Executa&quot;
      </label>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">Sign-in preview</p>
        <div className="flex items-center gap-2.5">
          {org.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoDataUrl} alt="" className="h-8 w-8 object-contain" />
          ) : (
            <span className="h-8 w-8 rounded-md" style={{ background: color }} />
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900 leading-tight">{shownName}</p>
            {form.loginTagline && <p className="text-xs text-slate-400 leading-tight">{form.loginTagline}</p>}
          </div>
        </div>
        <div className="mt-3 h-8 rounded-md text-xs text-white flex items-center justify-center" style={{ background: color }}>
          Sign in
        </div>
        {!form.hidePoweredBy && <p className="text-[11px] text-slate-400 mt-2">Powered by Executa</p>}
        {form.loginSlug && (
          <p className="text-xs text-slate-500 mt-2 break-all">
            Share: {origin}/login?org={form.loginSlug}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-3.5 py-2 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save white-label settings"}
        </button>
        {message && <p className={`text-xs ${message.ok ? "text-emerald-600" : "text-rose-600"}`}>{message.text}</p>}
      </div>
    </div>
  );
}
