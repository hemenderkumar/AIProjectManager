"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LayoutDashboard, FileText, FileBarChart } from "lucide-react";

// Real screenshots from the live app (captured 2026-09-01, org: eworkconnections) --
// replaces the earlier hand-built mockup carousel now that we have an account with enough
// real project data to show. Same crossfade/dot-nav shell as before.
const SCENES = [
  { key: "dashboard", label: "Portfolio dashboard", icon: LayoutDashboard, src: "/screenshots/dashboard.jpg" },
  { key: "charter", label: "AI-drafted charter", icon: FileText, src: "/screenshots/charter.jpg" },
  { key: "report", label: "Executive report", icon: FileBarChart, src: "/screenshots/report.jpg" },
] as const;

export default function HomeDemoCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => {
      setActive((i) => (i + 1) % SCENES.length);
    }, 4800);
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
        <p className="text-xs text-slate-400">From the live app</p>
      </div>

      <div className="relative aspect-[1295/500] sm:aspect-[1295/420]">
        {SCENES.map((scene, i) => (
          <div
            key={scene.key}
            className={`absolute inset-0 transition-opacity duration-500 ease-out ${
              i === active ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <Image
              src={scene.src}
              alt={`Executa ${scene.label} screenshot`}
              fill
              className="object-cover object-top"
              sizes="(max-width: 768px) 100vw, 640px"
              priority={i === 0}
            />
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
