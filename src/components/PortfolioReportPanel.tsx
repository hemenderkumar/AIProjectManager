"use client";
import { useState } from "react";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";

export default function PortfolioReportPanel() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setReport(null);
    try {
      const res = await fetch("/api/ai/generate-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      setReport(data.report);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!report) return;
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Portfolio-wide executive report</p>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Generates a C-level status report across every active project — health, risks, budget, and recommended actions.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {loading ? "Generating..." : "Generate Report"}
        </button>
        {report && (
          <button onClick={copy} className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <AiWaitIndicator
        active={loading}
        messages={["Reading every active project...", "Assessing health, risk, and budget...", "Drafting recommended actions..."]}
        className="mt-3"
      />
      {report && (
        <div className="mt-4 text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap border border-slate-100 max-h-96 overflow-y-auto scrollbar-thin">
          {report}
        </div>
      )}
    </div>
  );
}
