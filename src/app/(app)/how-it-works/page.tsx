"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import {
  Lightbulb, FileText, CheckCircle2, Rocket, FileSearch, ClipboardCheck, FileBarChart, Sparkles,
} from "lucide-react";

type Step = {
  icon: React.ReactNode;
  title: string;
  description: string;
  linkHref?: string;
  linkLabel?: string;
};

const STEPS: Step[] = [
  {
    icon: <Lightbulb size={22} />,
    title: "1. Ideation",
    description: "Capture the idea — problem statement, proposed solution, expected benefits. Brainstorm with AI and get an instant feasibility score before committing any resources.",
    linkHref: "/ideation",
    linkLabel: "Go to Ideation",
  },
  {
    icon: <FileText size={22} />,
    title: "2. Charter",
    description: "Lock down scope, requirements, and budget. AI drafts the full charter — including recommended technology and an architecture diagram — grounded in what you've already defined.",
  },
  {
    icon: <CheckCircle2 size={22} />,
    title: "3. Approval",
    description: "A PM or admin signs off, moving the project from planning into execution. No work starts on an idea that hasn't been approved.",
  },
  {
    icon: <Rocket size={22} />,
    title: "4. Plan & Execute",
    description: "AI generates a full task plan (or sprints, for Scrum/Hybrid teams), estimates effort and cost, and staffs it against your team's real skills and capacity.",
    linkHref: "/execution",
    linkLabel: "Go to Project Execution",
  },
  {
    icon: <FileSearch size={22} />,
    title: "5. Vendor SOW",
    description: "Bringing in a vendor? Draft a Statement of Work — scope, timeline, funding, risks, and milestones — with AI, get it approved internally, and track it through to signature.",
  },
  {
    icon: <ClipboardCheck size={22} />,
    title: "6. Deliverables",
    description: "AI generates the real work products: requirements & NFRs, a detailed design (with a diagram), executable test scripts, and release documentation — then tracks approvals and signed copies.",
  },
  {
    icon: <FileBarChart size={22} />,
    title: "7. Track & Report",
    description: "Log risks, status updates, and communications as you go. Get AI-flagged drift against the SOW, release-readiness verdicts, and polished PDF/PowerPoint reports for your steering committee.",
    linkHref: "/dashboard",
    linkLabel: "Go to Dashboard",
  },
  {
    icon: <Sparkles size={22} />,
    title: "8. Ask AI, anywhere",
    description: "Your AI PM is one click away on every screen (bottom-right) — ask it about the project you're viewing, or the whole portfolio, any time.",
  },
];

const AUTO_ADVANCE_MS = 4500;

export default function HowItWorksPage() {
  const [active, setActive] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActive((i) => (i + 1) % STEPS.length);
    }, AUTO_ADVANCE_MS);
  }

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(i: number) {
    setActive(i);
    resetTimer();
  }

  const step = STEPS[active];

  return (
    <div>
      <Topbar
        title="How Keel Works"
        subtitle="A guided walk-through of the project lifecycle, from first idea to signed-off delivery"
      />
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <div className="bg-accent-50/60 border border-accent-100 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-800">This isn&apos;t just another task tracker.</span>{" "}
          Steps 1–3 (ideation gates) and step 5 (a built-in RFP/SOW workflow) don&apos;t exist in Asana or
          Monday — and every draft in between is AI-generated, not built from a blank template.
        </div>
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6 sm:p-8">
          {/* Step dots + connecting flow line */}
          <div className="flex items-center mb-8 overflow-x-auto pb-2 scrollbar-thin">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center shrink-0">
                <button
                  onClick={() => goTo(i)}
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors ${
                    i === active
                      ? "bg-accent-600 text-white"
                      : i < active
                      ? "bg-accent-100 text-accent-600"
                      : "bg-slate-100 text-slate-400"
                  }`}
                  aria-label={s.title}
                  title={s.title}
                >
                  {i + 1}
                </button>
                {i < STEPS.length - 1 && (
                  <div className="w-6 sm:w-10 h-0.5 bg-slate-100 mx-1 overflow-hidden">
                    <div
                      className={`h-full bg-accent-300 ${i < active ? "animate-flow-line-grow" : ""}`}
                      style={{ transform: i < active ? undefined : "scaleX(0)", transformOrigin: "left" }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Active step panel */}
          <div key={active} className="animate-step-fade-in flex flex-col sm:flex-row gap-4 sm:items-start">
            <div className="h-12 w-12 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center shrink-0">
              {step.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-slate-900 mb-1.5">{step.title}</p>
              <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
              {step.linkHref && (
                <Link
                  href={step.linkHref}
                  className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 font-medium"
                >
                  {step.linkLabel} →
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-100">
            <button
              onClick={() => goTo((active - 1 + STEPS.length) % STEPS.length)}
              className="text-xs px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 font-medium"
            >
              ← Previous
            </button>
            <p className="text-xs text-slate-400">{active + 1} of {STEPS.length}</p>
            <button
              onClick={() => goTo((active + 1) % STEPS.length)}
              className="text-xs px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 font-medium"
            >
              Next →
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center">
          This plays automatically — click any step number to jump straight to it.
        </p>
      </div>
    </div>
  );
}
