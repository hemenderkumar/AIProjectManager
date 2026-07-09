import clsx from "clsx";
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
