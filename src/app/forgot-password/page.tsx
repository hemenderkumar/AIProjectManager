"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong. Try again.");
      return;
    }
    // Deliberately shown regardless of whether the email matched an account.
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
            <p className="text-sm font-semibold text-slate-900 mb-2">Check your email</p>
            <p className="text-xs text-slate-500">
              If an account exists for that email, we&apos;ve sent a link to reset your password. It expires in 1 hour.
            </p>
            <Link href="/login" className="inline-block mt-4 text-xs font-medium text-indigo-600 hover:text-indigo-700">
              Back to login
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-900 mb-1">Reset your password</p>
            <p className="text-xs text-slate-400 mb-4">Enter your email and we&apos;ll send you a link to set a new password.</p>
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
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
            <p className="text-xs text-slate-400 mt-4">
              <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
