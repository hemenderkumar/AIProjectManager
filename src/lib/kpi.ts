import { differenceInCalendarDays } from "date-fns";

export type RagStatus = "GREEN" | "YELLOW" | "RED";

export interface ProjectForHealth {
  id: string;
  stage: string;
  percentComplete: number;
  budgetPlanned: number | null;
  budgetActual: number | null;
  startDate: Date | null;
  targetEndDate: Date | null;
  ragStatus: RagStatus;
}

export interface TaskLite {
  status: string;
  dueDate: Date | null;
}

export interface RiskLite {
  impact: string;
  likelihood: string;
  status: string;
}

const severityScore: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * Computes schedule variance in days.
 * Positive = ahead/on schedule pace, Negative = behind schedule.
 * Uses expected % complete (based on elapsed time) vs actual % complete.
 */
export function scheduleVarianceDays(p: ProjectForHealth, now = new Date()) {
  if (!p.startDate || !p.targetEndDate) return 0;
  const totalDays = Math.max(
    1,
    differenceInCalendarDays(p.targetEndDate, p.startDate)
  );
  const elapsedDays = Math.min(
    totalDays,
    Math.max(0, differenceInCalendarDays(now, p.startDate))
  );
  const expectedPercent = (elapsedDays / totalDays) * 100;
  const percentGap = p.percentComplete - expectedPercent; // negative = behind
  // convert percent gap to an approximate day equivalent
  return Math.round((percentGap / 100) * totalDays);
}

export function budgetVariancePercent(p: ProjectForHealth) {
  const planned = p.budgetPlanned ?? 0;
  const actual = p.budgetActual ?? 0;
  if (planned <= 0) return 0;
  return Math.round(((actual - planned) / planned) * 100);
}

export function isOverdueTask(t: TaskLite, now = new Date()) {
  if (t.status === "DONE") return false;
  if (!t.dueDate) return false;
  return t.dueDate.getTime() < now.getTime();
}

export function riskScore(r: RiskLite) {
  if (r.status === "CLOSED") return 0;
  return (severityScore[r.impact] ?? 2) * (severityScore[r.likelihood] ?? 2);
}

/**
 * Rule-based automated RAG (health) computation for a project.
 * This is the "smart automation" layer: it looks at schedule slip,
 * budget overrun, overdue tasks and open high-severity risks to
 * flag projects before a human would notice.
 */
export function computeAutoRag(params: {
  project: ProjectForHealth;
  overdueTaskCount: number;
  openHighRiskCount: number;
  now?: Date;
}): { rag: RagStatus; reasons: string[] } {
  const { project, overdueTaskCount, openHighRiskCount } = params;
  const now = params.now ?? new Date();
  const reasons: string[] = [];

  if (project.stage === "CLOSED") {
    return { rag: "GREEN", reasons: ["Project closed"] };
  }

  const scheduleVar = scheduleVarianceDays(project, now);
  const budgetVar = budgetVariancePercent(project);

  let score = 0;

  if (scheduleVar <= -14) {
    score += 2;
    reasons.push(`Schedule slipping ~${Math.abs(scheduleVar)} days behind pace`);
  } else if (scheduleVar <= -5) {
    score += 1;
    reasons.push(`Slightly behind schedule (~${Math.abs(scheduleVar)} days)`);
  }

  if (budgetVar >= 20) {
    score += 2;
    reasons.push(`Budget overrun ${budgetVar}%`);
  } else if (budgetVar >= 10) {
    score += 1;
    reasons.push(`Budget trending over by ${budgetVar}%`);
  }

  if (overdueTaskCount >= 5) {
    score += 2;
    reasons.push(`${overdueTaskCount} overdue tasks`);
  } else if (overdueTaskCount >= 1) {
    score += 1;
    reasons.push(`${overdueTaskCount} overdue task(s)`);
  }

  if (openHighRiskCount >= 2) {
    score += 2;
    reasons.push(`${openHighRiskCount} open high-severity risks`);
  } else if (openHighRiskCount === 1) {
    score += 1;
    reasons.push(`1 open high-severity risk`);
  }

  let rag: RagStatus = "GREEN";
  if (score >= 4) rag = "RED";
  else if (score >= 2) rag = "YELLOW";

  if (reasons.length === 0) reasons.push("On track — no issues detected");

  return { rag, reasons };
}

export function ragColor(rag: RagStatus) {
  switch (rag) {
    case "GREEN":
      return { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" };
    case "YELLOW":
      return { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" };
    case "RED":
      return { bg: "bg-rose-100", text: "text-rose-700", dot: "bg-rose-500" };
  }
}

export const STAGES = [
  "INCEPTION",
  "IDEATION",
  "CHARTER",
  "EXECUTION",
  "CLOSING",
  "CLOSED",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  INCEPTION: "Inception",
  IDEATION: "Ideation",
  CHARTER: "Project Charter",
  EXECUTION: "Execution",
  CLOSING: "Closing",
  CLOSED: "Closed",
};
