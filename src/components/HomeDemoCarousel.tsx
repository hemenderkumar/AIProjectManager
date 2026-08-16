"use client";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, Kanban, FileBarChart, Check, Loader2 } from "lucide-react";

// Replaces the old single static "dashboard screenshot" mock on the public homepage with a
// short looping cross-fade between three product "scenes" -- no real screen-recording asset
// exists (or is worth maintaining in sync with the actual UI), so this simulates the effect
// cheaply with the same design-system building blocks (KPI tiles, RAG badges, kanban chips)
// used throughout the real app. Auto-advances on a timer, pauses on hover so it doesn't fight
// someone trying to actually read a scene, and exposes dot controls for manual jumping.
const PREVIEW_PROJECTS = [
  { name: "Core Platform Migration", stage: "Execution", pct: 62, rag: "GREEN" as const },
  { name: "Client Portal Revamp", stage: "Ideation", pct: 18, rag: "YELLOW" as const },
  { name: "Data Warehouse Upgrade", stage: "Execution", pct: 41, rag: "RED" as const },
];
const RAG_STYLES: Record<string, { bg: string; text: string; dot: string; bar: string }> = {
  GREEN: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  YELLOW: { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500", bar: "bg-amber-500" },
  RED: { bg: "bg-rose-100", text: "text-rose-700", dot: "bg-rose-500", bar: "bg-rose-500" },
};

const SPRINT_COLUMNS = [
  { label: "To do", tasks: ["Draft vendor RFP", "Wire up SSO callback"] },
  { label: "In progress", tasks: ["Migrate billing webhook", "Risk register review"] },
  { label: "Done", tasks: ["Kickoff deck", "Charter sign-off"] },
];

const SCENES = [
  { key: "dashboard", label: "Portfolio dashboard", icon: LayoutDashboard },
  { key: "sprint", label: "Sprint board", icon: Kanban },
  { key: "report", label: "AI-drafted report", icon: FileBarChart },
] as const;

export default function HomeDemoCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => {
      setActive((i) => (i + 1) % SCENES.length);
    }, 4200);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused]);

  return (
    <div
      className="card-lift rounded-xl border border-slate-200 shadow-sm shadow-slate-200/60 overflow-hidden bg-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          <p className="text-sm font-semibold text-slate-900 ml-2">Executa: {SCENES[active].label}</p>
        </div>
        <p className="text-xs text-slate-400">Sample data shown</p>
      </div>

      <div className="relative min-h-[280px]">
        {SCENES.map((scene, i) => (
          <div
            key={scene.key}
            className={`p-5 transition-all duration-500 ease-out ${
              i === active ? "opacity-100 relative" : "opacity-0 absolute inset-0 pointer-events-none translate-y-1"
            }`}
          >
            {scene.key === "dashboard" && <DashboardScene />}
            {scene.key === "sprint" && <SprintScene />}
            {scene.key === "report" && <ReportScene />}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-slate-100 py-3">
        {SCENES.map((scene, i) => (
          <button
            key={scene.key}
            onClick={() => setActive(i)}
            aria-label={`Show ${scene.label}`}
            className={`h-1.5 rounded-full transition-all ${i === active ? "w-6 bg-accent-600" : "w-1.5 bg-slate-200 hover:bg-slate-300"}`}
          />
        ))}
      </div>
    </div>
  );
}

function DashboardScene() {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <PreviewStat label="Active projects" value="12" />
        <PreviewStat label="On track" value="8" accent="text-emerald-600" />
        <PreviewStat label="At risk" value="4" accent="text-amber-600" />
        <PreviewStat label="Budget variance" value="+3%" />
      </div>
      <div className="space-y-3">
        {PREVIEW_PROJECTS.map((p) => {
          const c = RAG_STYLES[p.rag];
          return (
            <div key={p.name} className="flex items-center gap-4 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 truncate">{p.name}</p>
                <p className="text-xs text-slate-400">{p.stage}</p>
              </div>
              <div className="hidden sm:block w-32 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
                <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${p.pct}%` }} />
              </div>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${c.bg} ${c.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                {p.rag}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SprintScene() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {SPRINT_COLUMNS.map((col) => (
        <div key={col.label} className="bg-slate-50 rounded-lg p-2.5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-0.5">{col.label}</p>
          <div className="space-y-2">
            {col.tasks.map((t) => (
              <div key={t} className="bg-white rounded-md border border-slate-200/70 px-2.5 py-2 text-xs font-medium text-slate-700 shadow-sm shadow-slate-200/50">
                {t}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportScene() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-6">
      <div className="h-12 w-12 rounded-xl bg-accent-50 flex items-center justify-center mb-4">
        <Loader2 size={20} className="text-accent-600 animate-spin" style={{ animationDuration: "2.2s" }} />
      </div>
      <p className="text-sm font-semibold text-slate-900 mb-1">Drafting your steering committee deck…</p>
      <p className="text-xs text-slate-500 mb-5 max-w-xs">
        Planned vs. actual, budget variance, and top risks pulled straight from the portfolio.
      </p>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700">
          <Check size={12} /> PDF ready
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700">
          <Check size={12} /> PowerPoint ready
        </span>
      </div>
    </div>
  );
}

function PreviewStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
      <p className={`text-lg font-semibold ${accent ?? "text-slate-900"}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
