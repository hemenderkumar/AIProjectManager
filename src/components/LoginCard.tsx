"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

// Shared login form — embedded directly on the marketing homepage (docked to the side)
// and also used standalone on /login (e.g. for a session-expired redirect with ?next=, or an
// ?error= from a failed SSO round-trip -- see LoginScreen in app/login/page.tsx, which is the
// only caller that passes ssoError since it's the only one reading query params).
export default function LoginCard({ next, id, ssoError }: { next?: string; id?: string; ssoError?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showSso, setShowSso] = useState(false);
  const [ssoEmail, setSsoEmail] = useState("");
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoLookupError, setSsoLookupError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Login failed");
      return;
    }
    router.push(next || "/home");
    router.refresh();
  }

  async function lookupSso(e: React.FormEvent) {
    e.preventDefault();
    setSsoLoading(true);
    setSsoLookupError(null);
    const res = await fetch("/api/sso/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ssoEmail }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSsoLoading(false);
      setSsoLookupError(data?.error ?? "No SSO configuration found for this email.");
      return;
    }
    // Full navigation, not router.push -- this URL immediately 302s onward to the customer's
    // IdP, outside the Next.js client router entirely.
    window.location.href = data.loginUrl;
  }

  return (
    <div id={id} className="w-full max-w-sm bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
      <p className="text-sm font-semibold text-slate-900 mb-1">Log in to Executa</p>
      <p className="text-xs text-slate-400 mb-4">Use the credentials your Executa administrator set up for you.</p>
      {ssoError && <p className="text-xs text-rose-600 mb-3 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{ssoError}</p>}
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
            placeholder="you@company.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-slate-500">Password</label>
            <Link href="/forgot-password" className="text-xs text-accent-600 hover:text-accent-700">
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="mt-4 pt-4 border-t border-slate-100">
        {!showSso ? (
          <button
            type="button"
            onClick={() => setShowSso(true)}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50"
          >
            <ShieldCheck size={13} /> Sign in with SSO
          </button>
        ) : (
          <form onSubmit={lookupSso} className="space-y-2">
            <label className="block text-xs font-medium text-slate-500">Work email</label>
            <input
              type="email"
              required
              value={ssoEmail}
              onChange={(e) => setSsoEmail(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
              placeholder="you@yourcompany.com"
            />
            {ssoLookupError && <p className="text-xs text-rose-600">{ssoLookupError}</p>}
            <button
              type="submit"
              disabled={ssoLoading}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {ssoLoading ? "Looking up..." : "Continue with SSO"}
            </button>
          </form>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-4">
        New here? <Link href="/register" className="text-accent-600 hover:text-accent-700 font-medium">Request access</Link>
      </p>
      {process.env.NODE_ENV !== "production" && (
        <p className="text-xs text-slate-400 mt-2">
          Seeded admin login: admin@example.com / changeme123 (set your own via .env.local, then re-seed)
        </p>
      )}
    </div>
  );
}
