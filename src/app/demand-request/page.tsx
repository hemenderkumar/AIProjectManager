"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function DemandRequestPage() {
  const [form, setForm] = useState({ title: "", description: "", requestedByName: "", requestedByEmail: "" });
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
    const res = await fetch("/api/demand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not submit request");
      return;
    }
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 gap-6">
      <div className="flex items-center gap-2.5">
        <Image src="/executa-mark.svg" alt="Executa" width={36} height={36} />
        <div>
          <p className="text-sm font-semibold text-slate-900 leading-tight">Executa</p>
          <p className="text-xs text-slate-400 leading-tight">Guiding project success</p>
        </div>
      </div>

      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
        {submitted ? (
          <div className="text-center py-2">
            <p className="text-sm font-semibold text-slate-900 mb-2">Request submitted</p>
            <p className="text-xs text-slate-500">
              Thanks — this lands in the demand backlog for triage. You&rsquo;ll hear back once someone
              reviews it; no account needed to submit.
            </p>
            <Link href="/login" className="inline-block mt-4 text-xs font-medium text-accent-600 hover:text-accent-700">
              Back to login
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-900 mb-1">Request something</p>
            <p className="text-xs text-slate-500 mb-4">
              A quick way to ask for a new project, enhancement, or fix — no login required. This isn&rsquo;t
              a commitment to build it; it just gets your request into the queue to be triaged.
            </p>
            {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
            <form onSubmit={submit} className="space-y-3">
              <input
                required
                placeholder="What do you need? (short title)"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
              <textarea
                required
                placeholder="Describe it — what problem does this solve, and why now?"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={4}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
              <input
                required
                placeholder="Your name"
                value={form.requestedByName}
                onChange={(e) => update("requestedByName", e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
              <input
                required
                type="email"
                placeholder="Your email"
                value={form.requestedByEmail}
                onChange={(e) => update("requestedByEmail", e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 rounded-lg text-sm font-medium bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
              >
                {loading ? "Submitting…" : "Submit request"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
