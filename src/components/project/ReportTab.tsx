"use client";
import { useState } from "react";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, PrimaryButton } from "./ui";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";

export default function ReportTab({ detail }: { detail: ProjectDetail }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setReport(null);
    try {
      const res = await fetch("/api/ai/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: detail.project.id }),
      });
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
    <div className="max-w-3xl space-y-4">
      <Card title="C-Level Status Report">
        <p className="text-sm text-slate-500 mb-4">
          Generates an executive-ready status report for {detail.project.name} using the latest
          KPIs, risks, and status updates — ready to paste into an email or slide.
        </p>
        <div className="flex items-center gap-2">
          <PrimaryButton onClick={generate} disabled={loading} className="flex items-center gap-1.5">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? "Generating..." : "Generate Executive Report"}
          </PrimaryButton>
          {report && (
            <button onClick={copy} className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>

        {report && (
          <div className="mt-5 prose prose-sm max-w-none bg-slate-50 rounded-lg p-4 border border-slate-100 whitespace-pre-wrap text-slate-700">
            {report}
          </div>
        )}
      </Card>
    </div>
  );
}
