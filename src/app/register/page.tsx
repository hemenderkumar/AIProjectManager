"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

type RegType = "INDIVIDUAL" | "COMPANY_OWNER";

export default function RegisterPage() {
  const [type, setType] = useState<RegType>("INDIVIDUAL");
  const [form, setForm] = useState({ name: "", email: "", password: "", companyName: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, type }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not submit registration");
      return;
    }
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 gap-6">
      <div className="flex items-center gap-2.5">
        <Image src="/keel-mark.svg" alt="Keel" width={36} height={36} />
        <div>
          <p className="text-sm font-semibold text-slate-900 leading-tight">Keel</p>
          <p className="text-xs text-slate-400 leading-tight">Guiding project success</p>
        </div>
      </div>

      <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
        {submitted ? (
          <div className="text-center py-2">
            <p className="text-sm font-semibold text-slate-900 mb-2">
              {type === "INDIVIDUAL" ? "You're in" : "Request submitted"}
            </p>
            <p className="text-xs text-slate-500">
              {type === "INDIVIDUAL"
                ? "Your account is ready — log in now with the email and password you just set. An admin will still review the request, but that won't affect your access."
                : "Thanks — an admin needs to review this before your company's account is created. You'll be able to log in once it's approved."}
            </p>
            <Link href="/login" className="inline-block mt-4 text-xs font-medium text-accent-600 hover:text-accent-700">
              {type === "INDIVIDUAL" ? "Log in now" : "Back to login"}
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-900 mb-1">Request access to Keel</p>
            <p className="text-xs text-slate-400 mb-4">
              {type === "INDIVIDUAL"
                ? "You'll be able to log in right away — an admin reviews new individual accounts afterward, but it won't hold up your access."
                : "Creating a company account needs admin approval first — you'll be able to log in once it's approved."}
            </p>

            <div className="flex rounded-lg border border-slate-200 p-0.5 mb-4 text-xs font-medium">
              <button
                type="button"
                onClick={() => setType("INDIVIDUAL")}
                className={`flex-1 py-1.5 rounded-md transition-colors ${
                  type === "INDIVIDUAL" ? "bg-accent-600 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                Individual
              </button>
              <button
                type="button"
                onClick={() => setType("COMPANY_OWNER")}
                className={`flex-1 py-1.5 rounded-md transition-colors ${
                  type === "COMPANY_OWNER" ? "bg-accent-600 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                Company owner
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {type === "COMPANY_OWNER" && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Company name</label>
                  <input
                    required
                    value={form.companyName}
                    onChange={(e) => update("companyName", e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
                    placeholder="Acme Corp"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {type === "COMPANY_OWNER" ? "Your name" : "Full name"}
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
                  placeholder="At least 8 characters"
                />
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Request access"}
              </button>
            </form>
            <p className="text-xs text-slate-400 mt-4">
              Already have an account? <Link href="/login" className="text-accent-600 hover:text-accent-700 font-medium">Log in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
