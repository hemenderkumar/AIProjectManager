"use client";
import { useState } from "react";

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

export default function SatisfactionForm({ token }: { token: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [csatScore, setCsatScore] = useState<number | null>(null);
  const [comments, setComments] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/satisfaction/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ npsScore, csatScore, comments: comments || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      setSubmitted(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Something went wrong -- try again.");
    }
  }

  if (submitted) {
    return <p className="text-sm text-emerald-600">Thanks for taking the time — this really helps.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-2">
          On a scale of 0-10, how likely are you to recommend working with us to a colleague?
        </label>
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setNpsScore(n)}
              className={`w-8 h-8 rounded-lg text-xs font-medium border transition-colors ${
                npsScore === n ? "bg-accent-600 text-white border-accent-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-0.5">
          <span>Not likely</span>
          <span>Extremely likely</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-2">How satisfied are you with how things are going overall?</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setCsatScore(n)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                csatScore === n ? "bg-accent-600 text-white border-accent-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-0.5">
          <span>Very unsatisfied</span>
          <span>Very satisfied</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Anything you&apos;d like us to know? (optional)</label>
        <textarea value={comments} onChange={(e) => setComments(e.target.value)} className={inputCls} rows={3} />
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={saving || (npsScore == null && csatScore == null)}
        className="w-full px-4 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
      >
        {saving ? "Sending..." : "Submit feedback"}
      </button>
    </form>
  );
}
