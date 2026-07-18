"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Shared login form — embedded directly on the marketing homepage (docked to the side)
// and also used standalone on /login (e.g. for a session-expired redirect with ?next=).
export default function LoginCard({ next, id }: { next?: string; id?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div id={id} className="w-full max-w-sm bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
      <p className="text-sm font-semibold text-slate-900 mb-1">Log in to Keel</p>
      <p className="text-xs text-slate-400 mb-4">Use the credentials your Keel administrator set up for you.</p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="you@company.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-slate-500">Password</label>
            <Link href="/forgot-password" className="text-xs text-indigo-600 hover:text-indigo-700">
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="text-xs text-slate-400 mt-4">
        New here? <Link href="/register" className="text-indigo-600 hover:text-indigo-700 font-medium">Request access</Link>
      </p>
      {process.env.NODE_ENV !== "production" && (
        <p className="text-xs text-slate-400 mt-2">
          Seeded admin login: admin@example.com / changeme123 (set your own via .env.local, then re-seed)
        </p>
      )}
    </div>
  );
}
