"use client";
import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { CheckCircle2, XCircle, TrendingUp, AlertTriangle, Target, Compass, LineChart as LineChartIcon, Swords, ArrowRight } from "lucide-react";
import type { ProjectDetail } from "./ProjectTabs";
import { formatDate } from "@/lib/format";
import { computeUpfrontInvestment, computeRoiSeries } from "@/lib/businessCaseRoi";
import { extractRoadmapSteps } from "@/lib/businessCaseRoadmap";

const DURATION_OPTIONS = [
  { label: "1 yr", months: 12 },
  { label: "2 yr", months: 24 },
  { label: "3 yr", months: 36 },
];

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const EMPTY = "Not yet drafted.";

function splitLines(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function Prose({ text }: { text: string | null | undefined }) {
  const lines = splitLines(text);
  if (!lines.length) return <p className="text-sm text-slate-400 italic">{EMPTY}</p>;
  // If every line looked like a bullet, render as a list; otherwise as a paragraph.
  const wasBulleted = text!.split("\n").some((l) => /^\s*[-*]\s+/.test(l));
  if (wasBulleted) {
    return (
      <ul className="space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className="text-sm text-slate-700 leading-relaxed flex gap-2">
            <span className="text-slate-300 mt-0.5">&bull;</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{text}</p>;
}

// Formal, "formal deck-like" read view of the Business Case — mirrors the structure and visual
// language of the investor-grade PPTX export (businessCaseExport.ts) so the on-screen tab isn't
// just plain textareas: a SWOT quadrant grid, a revenue chart, a roadmap timeline, and
// unit-economics/funding tables, all computed from the same real project fields the PPTX uses
// (never invented). Sits alongside the editable form in BusinessCaseWorkspace via an Edit/Preview
// toggle — this component never writes anything, it only renders.
export default function BusinessCasePreview({ detail }: { detail: ProjectDetail }) {
  const p = detail.project;
  const [roiDurationMonths, setRoiDurationMonths] = useState(36);
  const implementationItems = detail.costItems
    .filter((c) => c.category === "IMPLEMENTATION")
    .map((c) => ({ name: c.name, amount: c.amount }));

  const priceKnown = p.quotedUnitPrice != null;
  const materialKnown = p.materialCostEstimate != null;
  const volumeKnown = p.targetMonthlyVolume != null;
  const monthlyRevenue = priceKnown && volumeKnown ? (p.quotedUnitPrice as number) * (p.targetMonthlyVolume as number) : null;
  const grossMarginPerUnit = priceKnown && materialKnown ? (p.quotedUnitPrice as number) - (p.materialCostEstimate as number) : null;

  const revenueChartData =
    priceKnown && volumeKnown
      ? [0.5, 1, 1.5].map((mult, i) => {
          const volume = Math.round((p.targetMonthlyVolume as number) * mult);
          return {
            scenario: ["Conservative", "Base", "Stretch"][i],
            revenue: Math.round(volume * (p.quotedUnitPrice as number)),
          };
        })
      : [];

  const steps = extractRoadmapSteps(p.businessRoadmap);
  const implTotal = implementationItems.reduce((s, i) => s + i.amount, 0);
  const contingencyAmount = p.contingencyPercent != null ? Math.round(implTotal * (p.contingencyPercent / 100)) : 0;
  const totalFunding = computeUpfrontInvestment(implementationItems, p.contingencyPercent, p.totalFundingRequired);

  const roiSeries = computeRoiSeries(
    {
      quotedUnitPrice: p.quotedUnitPrice,
      targetMonthlyVolume: p.targetMonthlyVolume,
      targetMarginPercent: p.targetMarginPercent,
      upfrontInvestment: totalFunding,
    },
    roiDurationMonths
  );
  // Thin the x-axis down to roughly a label every quarter (or every month for a 1-year view) so
  // 24-36 monthly points don't collide into unreadable text.
  const roiTickInterval = roiSeries ? Math.max(0, Math.ceil(roiSeries.length / 12) - 1) : 0;
  const roiBreakEvenMonth = roiSeries?.find((pt) => pt.cumulativeNetBenefit >= 0)?.month ?? null;

  // The Ask is a fixed claim ("invest $X, get Y% ROI"), so it always shows the full 3-year
  // payoff regardless of whatever duration the reader has toggled on the chart above.
  const askRoiSeries = computeRoiSeries(
    { quotedUnitPrice: p.quotedUnitPrice, targetMonthlyVolume: p.targetMonthlyVolume, targetMarginPercent: p.targetMarginPercent, upfrontInvestment: totalFunding },
    36
  );
  const askRoi3yr = askRoiSeries?.[askRoiSeries.length - 1] ?? null;
  const askBreakEvenMonth = askRoiSeries?.find((pt) => pt.cumulativeNetBenefit >= 0)?.month ?? null;

  // Market sizing (TAM/SAM/SOM) is PM-entered, never AI-invented — 0 means "not entered" (same
  // convention as quotedUnitPrice elsewhere), so only render figures that are actually set.
  const marketSizing = [
    { label: "TAM", sub: "Total Addressable Market", value: p.marketSizeTam },
    { label: "SAM", sub: "Serviceable Available Market", value: p.marketSizeSam },
    { label: "SOM", sub: "Serviceable Obtainable Market", value: p.marketSizeSom },
  ].filter((m) => m.value != null && m.value > 0) as { label: string; sub: string; value: number }[];
  const marketSizingMax = marketSizing.length ? Math.max(...marketSizing.map((m) => m.value)) : 0;

  const swotQuadrants = [
    { label: "Strengths", value: p.swotStrengths, icon: CheckCircle2, ring: "ring-emerald-100", bg: "bg-emerald-50", text: "text-emerald-700", iconColor: "text-emerald-600" },
    { label: "Weaknesses", value: p.swotWeaknesses, icon: XCircle, ring: "ring-rose-100", bg: "bg-rose-50", text: "text-rose-700", iconColor: "text-rose-600" },
    { label: "Opportunities", value: p.swotOpportunities, icon: TrendingUp, ring: "ring-blue-100", bg: "bg-blue-50", text: "text-blue-700", iconColor: "text-blue-600" },
    { label: "Threats", value: p.swotThreats, icon: AlertTriangle, ring: "ring-amber-100", bg: "bg-amber-50", text: "text-amber-700", iconColor: "text-amber-600" },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Cover */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-900 to-indigo-700 text-white p-8 shadow-lg shadow-indigo-900/20">
        <p className="text-xs font-semibold tracking-widest text-indigo-200 uppercase mb-2">Financial Forecast &amp; Projections</p>
        <h2 className="text-2xl sm:text-3xl font-bold mb-1">{p.name}</h2>
        <p className="text-sm text-indigo-200">{formatDate(new Date())}</p>
      </div>

      {/* Executive Summary — the top-of-deck synthesis, deliberately un-numbered and visually
          distinct from the sections below since it's meant to stand on its own even if a reader
          never gets past it. */}
      {p.businessCaseExecutiveSummary?.trim() && (
        <section className="rounded-xl border-l-4 border-indigo-600 bg-indigo-50/60 px-6 py-5">
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase mb-2">Executive Summary</p>
          <p className="text-[15px] text-slate-800 leading-relaxed whitespace-pre-wrap">{p.businessCaseExecutiveSummary.trim()}</p>
        </section>
      )}

      {/* The Opportunity */}
      <section className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase mb-1">01 &middot; The Problem</p>
            <h3 className="text-lg font-bold text-slate-900 mb-3">The Opportunity</h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{p.problemStatement?.trim() || EMPTY}</p>
          </div>
          {p.feasibilityScore != null && (
            <div className="shrink-0 w-28 h-28 rounded-xl bg-indigo-50 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-indigo-600">{p.feasibilityScore}</span>
              <span className="text-[10px] text-slate-500 text-center px-1">/ 100 feasibility</span>
            </div>
          )}
        </div>
      </section>

      {/* Our Solution */}
      <section className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
        <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase mb-1">02 &middot; The Business Case</p>
        <h3 className="text-lg font-bold text-slate-900 mb-3">Our Solution</h3>
        <Prose text={p.businessCase} />
      </section>

      {/* SWOT */}
      <section>
        <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase mb-1 px-1">03</p>
        <h3 className="text-lg font-bold text-slate-900 mb-3 px-1">SWOT Analysis</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {swotQuadrants.map((q) => (
            <div key={q.label} className={`rounded-xl ${q.bg} ring-1 ${q.ring} p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <q.icon size={16} className={q.iconColor} />
                <p className={`text-sm font-bold ${q.text}`}>{q.label}</p>
              </div>
              <Prose text={q.value} />
            </div>
          ))}
        </div>
      </section>

      {/* Market Analysis & Outlook */}
      <section className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
        <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase mb-1">04</p>
        <h3 className="text-lg font-bold text-slate-900 mb-4">Market Analysis &amp; Outlook</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-semibold text-indigo-600 mb-2">Market analysis</p>
            <Prose text={p.marketAnalysis} />
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-600 mb-2">Market prediction</p>
            <Prose text={p.marketPrediction} />
          </div>
        </div>
        {marketSizing.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-sm font-semibold text-indigo-600 mb-3">Market sizing</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {marketSizing.map((m) => (
                <div key={m.label} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold text-slate-500 mb-0.5">
                    {m.label} <span className="font-normal text-slate-400">&middot; {m.sub}</span>
                  </p>
                  <p className="text-xl font-bold text-slate-900 mb-1.5">{money(m.value)}<span className="text-xs font-normal text-slate-400">/yr</span></p>
                  <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${Math.max(4, Math.round((m.value / marketSizingMax) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Competitive Differentiation */}
      <section className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
        <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase mb-1">05</p>
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Swords size={17} className="text-indigo-600" /> Competitive Differentiation
        </h3>
        <Prose text={p.competitiveDifferentiation} />
      </section>

      {/* Approach & Technology */}
      {(p.recommendedTechnology?.trim() || p.technicalRecommendationRationale?.trim()) && (
        <section className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
          <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase mb-1">06 &middot; Why This Will Work</p>
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Compass size={17} className="text-indigo-600" /> Approach &amp; Technology
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1">Recommended approach</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{p.recommendedTechnology?.trim() || EMPTY}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1">Rationale</p>
              <Prose text={p.technicalRecommendationRationale} />
            </div>
          </div>
        </section>
      )}

      {/* Unit Economics */}
      <section className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
        <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase mb-1">07</p>
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Target size={17} className="text-indigo-600" /> Unit Economics
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            ["Quoted unit price", priceKnown ? money(p.quotedUnitPrice as number) : "Not set"],
            ["Material cost / unit", materialKnown ? money(p.materialCostEstimate as number) : "Not set"],
            ["Gross margin / unit", grossMarginPerUnit != null ? money(grossMarginPerUnit) : "—"],
            ["Target margin", p.targetMarginPercent != null ? `${p.targetMarginPercent}%` : "Not set"],
            ["Target monthly volume", volumeKnown ? `${p.targetMonthlyVolume}/mo` : "Not set"],
            ["Modeled monthly revenue", monthlyRevenue != null ? money(monthlyRevenue) : "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] text-slate-500 mb-0.5">{label}</p>
              <p className="text-sm font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Revenue Projections */}
      <section className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
        <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase mb-1">08</p>
        <h3 className="text-lg font-bold text-slate-900 mb-4">Revenue Projections</h3>
        {revenueChartData.length ? (
          <div className="h-64 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueChartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF2F7" />
                <XAxis dataKey="scenario" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: "#EEF2FF" }} />
                <Bar dataKey="revenue" fill="#4F46E5" radius={[6, 6, 0, 0]} maxBarSize={80} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic mb-3">
            Set a quoted unit price and target monthly volume in Charter to generate a revenue chart.
          </p>
        )}
        <div className="mt-3">
          <Prose text={p.revenueProjections} />
        </div>
      </section>

      {/* Roadmap: Benefits & ROI projection (a chart, not text) + the sequenced steps below it */}
      <section className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
        <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase mb-1">09</p>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <LineChartIcon size={17} className="text-indigo-600" /> Benefits &amp; ROI Projection
          </h3>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.months}
                onClick={() => setRoiDurationMonths(opt.months)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  roiDurationMonths === opt.months ? "bg-accent-600 text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {roiSeries ? (
          <>
            <p className="text-xs text-slate-400 mb-3">
              Cumulative net benefit and ROI over {roiDurationMonths / 12} year{roiDurationMonths > 12 ? "s" : ""}, ramping
              linearly to the target monthly volume over the first 6 months, then holding — net benefit is monthly
              revenue at the target margin, against the {money(totalFunding as number)} upfront investment.
              {roiBreakEvenMonth != null
                ? ` Breaks even around month ${roiBreakEvenMonth}.`
                : " Doesn't break even within this window at the current assumptions."}
            </p>
            <div className="h-72 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={roiSeries} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF2F7" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(m) => `M${m}`}
                    interval={roiTickInterval}
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    axisLine={{ stroke: "#E2E8F0" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="benefit"
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <YAxis
                    yAxisId="roi"
                    orientation="right"
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => (name === "ROI" ? [`${v}%`, name] : [money(v), name])}
                    labelFormatter={(m) => `Month ${m}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine yAxisId="benefit" y={0} stroke="#CBD5E1" />
                  <Line
                    yAxisId="benefit"
                    type="monotone"
                    dataKey="cumulativeNetBenefit"
                    name="Cumulative net benefit"
                    stroke="#4F46E5"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line yAxisId="roi" type="monotone" dataKey="roiPercent" name="ROI" stroke="#059669" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400 italic mb-3">
            Set quoted unit price, target monthly volume, and target margin in Charter, plus a funding figure
            (implementation cost items or Total Funding Required), to generate a benefits/ROI projection.
          </p>
        )}

        <div className="mt-6 pt-6 border-t border-slate-100">
          <p className="text-sm font-semibold text-indigo-600 mb-3">Implementation steps</p>
          {steps.length ? (
            <ol className="space-y-0">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    {i < steps.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1" />}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed pb-5 pt-0.5">{step}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-400 italic">{EMPTY}</p>
          )}
        </div>
      </section>

      {/* The Ask */}
      <section className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
        <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase mb-1">10 &middot; What We Need To Move Forward</p>
        <h3 className="text-lg font-bold text-slate-900 mb-4">The Ask</h3>
        {totalFunding != null && askRoi3yr && (
          <div className="mb-5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-5 py-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-lg sm:text-xl font-bold">Invest {money(totalFunding)}</span>
            <ArrowRight size={18} className="text-indigo-200 shrink-0" />
            <span className="text-lg sm:text-xl font-bold">{askRoi3yr.roiPercent}% ROI within 3 years</span>
            <span className="text-xs text-indigo-200 w-full sm:w-auto sm:ml-1">
              {askBreakEvenMonth != null ? `Breaks even around month ${askBreakEvenMonth}.` : "Doesn't break even within 3 years at current assumptions."}
            </span>
          </div>
        )}
        {implementationItems.length || totalFunding != null ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 text-white text-left">
                <th className="py-2 px-3 rounded-l-lg font-semibold text-xs">Use of funds</th>
                <th className="py-2 px-3 rounded-r-lg font-semibold text-xs text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {implementationItems.map((item, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 px-3 text-slate-600">{item.name}</td>
                  <td className="py-2 px-3 text-right text-slate-900">{money(item.amount)}</td>
                </tr>
              ))}
              {p.contingencyPercent != null && (
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-3 text-slate-600">Contingency ({p.contingencyPercent}%)</td>
                  <td className="py-2 px-3 text-right text-slate-900">{money(contingencyAmount)}</td>
                </tr>
              )}
              <tr>
                <td className="py-2.5 px-3 font-bold text-slate-900">Total funding required</td>
                <td className="py-2.5 px-3 text-right font-bold text-indigo-600">
                  {totalFunding != null ? money(totalFunding) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400 italic">No implementation budget captured yet — add cost items in Charter&apos;s Cost Summary.</p>
        )}
      </section>
    </div>
  );
}
