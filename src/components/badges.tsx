import clsx from "clsx";
import { Sparkles, User, Building2 } from "lucide-react";
import { ragColor, STAGE_LABELS } from "@/lib/kpi";

export function RagBadge({ rag }: { rag: string }) {
  const c = ragColor(rag as "GREEN" | "YELLOW" | "RED");
  return (
    <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", c.bg, c.text)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", c.dot)} />
      {rag}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}

const priorityColors: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-sky-100 text-sky-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-rose-100 text-rose-700",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", priorityColors[priority] ?? "bg-slate-100 text-slate-600")}>
      {priority}
    </span>
  );
}

const taskStatusColors: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-sky-100 text-sky-700",
  BLOCKED: "bg-rose-100 text-rose-700",
  DONE: "bg-emerald-100 text-emerald-700",
};

export function TaskStatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", taskStatusColors[status] ?? "bg-slate-100 text-slate-600")}>
      {status.replace("_", " ")}
    </span>
  );
}

// Who/what should actually execute a task, suggested by AI at creation time (bulk planner or
// single-task Draft with AI) and always human-editable. The AI case gets a distinct, more
// prominent treatment (solid indigo, sparkle icon) since "AI can just do this one" is the
// most actionable of the three -- it's the one worth a PM's attention, whereas Internal is
// just the default and Vendor is a heads-up, not a call to action.
export function ExecutionSourceBadge({ source }: { source: "AI" | "INTERNAL" | "VENDOR" | null | undefined }) {
  if (!source) return null;
  if (source === "AI") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-600 text-white">
        <Sparkles size={11} /> AI recommended
      </span>
    );
  }
  if (source === "VENDOR") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
        <Building2 size={11} /> Vendor
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
      <User size={11} /> Internal
    </span>
  );
}
