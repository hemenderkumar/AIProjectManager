"use client";
import { useState } from "react";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, PrimaryButton } from "./ui";
import { Sparkles, Loader2, Copy, Check, FileDown, Presentation } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

type ChartData = {
  budget: { planned: number; actual: number };
  schedule: { plannedPercent: number; actualPercent: number };
  effort: { plannedHours: number; actualHours: number };
};

export default function ReportTab({ detail }: { detail: ProjectDetail }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "pptx" | null>(null);

  async function generate() {
    setLoading(true);
    setReport(null);
    setChartData(null);
    try {
      const res = await fetch("/api/ai/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: detail.project.id }),
      });
      const data = await res.json();
      setReport(data.report);
      setChartData(data.chartData ?? null);
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

  async function exportFile(format: "pdf" | "pptx") {
    if (!report) return;
    setExporting(format);
    try {
      const res = await fetch(`/api/reports/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: detail.project.id, report }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug = detail.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
      a.href = url;
      a.download = `${slug}-status-report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  const chartRows = chartData
    ? [
        { name: "Budget ($)", Planned: chartData.budget.planned, Actual: chartData.budget.actual },
        { name: "Schedule (%)", Planned: chartData.schedule.plannedPercent, Actual: chartData.schedule.actualPercent },
        { name: "Effort (hrs)", Planned: chartData.effort.plannedHours, Actual: chartData.effort.actualHours },
      ]
    : [];

  return (
    <div className="max-w-3xl space-y-4">
      <Card title="C-Level Status Report">
        <p className="text-sm text-slate-500 mb-4">
          Generates an executive-ready status report for {detail.project.name} using the latest
          KPIs, risks, and status updates — including a planned-vs-actual chart for budget,
          schedule, and effort. Export as PDF or PowerPoint once generated.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <PrimaryButton onClick={generate} disabled={loading} className="flex items-center gap-1.5">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? "Generating..." : "Generate Executive Report"}
          </PrimaryButton>
          {report && (
            <>
              <button onClick={copy} className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => exportFile("pdf")}
                disabled={exporting === "pdf"}
                className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
              >
                {exporting === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                Export PDF
              </button>
              <button
                onClick={() => exportFile("pptx")}
                disabled={exporting === "pptx"}
                className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
              >
                {exporting === "pptx" ? <Loader2 size={14} className="animate-spin" /> : <Presentation size={14} />}
                Export PowerPoint
              </button>
            </>
          )}
        </div>

        {chartData && (
          <div className="mt-5">
            <p className="text-xs font-semibold text-slate-700 mb-1.5">Planned vs Actual</p>
            <div className="h-56 border border-slate-100 rounded-lg bg-white p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Planned" fill="#c7d2fe" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Actual" fill="#4f46e5" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {report && (
          <div className="mt-5 prose prose-sm max-w-none bg-slate-50 rounded-lg p-4 border border-slate-100 whitespace-pre-wrap text-slate-700">
            {report}
          </div>
        )}
      </Card>
    </div>
  );
}
