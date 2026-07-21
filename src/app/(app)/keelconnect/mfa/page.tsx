"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Topbar from "@/components/Topbar";
import { ShieldCheck } from "lucide-react";

type Status = { mfaEnabled: boolean; mfaRequired: boolean };

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

export default function KeelConnectMfaPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/keelconnect/mfa/status");
    if (res.ok) setStatus(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function startSetup() {
    setError(null);
    const res = await fetch("/api/keelconnect/mfa/setup", { method: "POST" });
    if (!res.ok) {
      setError("Could not start MFA setup.");
      return;
    }
    const data = await res.json();
    setQrCodeDataUrl(data.qrCodeDataUrl);
    setSecret(data.secret);
  }

  async function confirmSetup() {
    setError(null);
    const res = await fetch("/api/keelconnect/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Invalid code.");
      return;
    }
    setQrCodeDataUrl(null);
    setSecret(null);
    setToken("");
    load();
  }

  async function disable() {
    setError(null);
    const res = await fetch("/api/keelconnect/mfa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: disableToken }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Invalid code.");
      return;
    }
    setDisableToken("");
    load();
  }

  if (loading) {
    return (
      <div>
        <Topbar title="Two-factor authentication" />
        <div className="p-8 text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <Topbar title="Two-factor authentication" subtitle="Required for Client Finance Approver and Platform roles on KeelConnect" />
      <div className="p-8 max-w-lg space-y-6">
        {status?.mfaRequired && !status.mfaEnabled && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            One of your KeelConnect roles requires MFA. You won&apos;t be able to use it until you set this up.
          </div>
        )}

        {status?.mfaEnabled ? (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-900 flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-500" /> MFA is enabled</p>
            <p className="text-xs text-slate-500">Enter a current code to disable it.</p>
            <div className="flex gap-2">
              <input placeholder="6-digit code" value={disableToken} onChange={(e) => setDisableToken(e.target.value)} className={inputCls} />
              <button onClick={disable} className="shrink-0 px-3 py-2 rounded-lg border border-rose-200 text-rose-600 text-xs font-medium hover:bg-rose-50">Disable</button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Set up an authenticator app</p>
            {!qrCodeDataUrl ? (
              <button onClick={startSetup} className="px-3.5 py-2 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-700">
                Start setup
              </button>
            ) : (
              <>
                <p className="text-xs text-slate-500">Scan this with Google Authenticator, Microsoft Authenticator, 1Password, or similar.</p>
                <Image src={qrCodeDataUrl} alt="MFA QR code" width={200} height={200} unoptimized className="rounded-lg border border-slate-100" />
                {secret && <p className="text-xs text-slate-400 font-mono">Manual entry key: {secret}</p>}
                <div className="flex gap-2">
                  <input placeholder="6-digit code from app" value={token} onChange={(e) => setToken(e.target.value)} className={inputCls} />
                  <button onClick={confirmSetup} className="shrink-0 px-3 py-2 rounded-lg bg-accent-600 text-white text-xs font-medium hover:bg-accent-700">Confirm</button>
                </div>
              </>
            )}
          </div>
        )}
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
