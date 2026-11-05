import { computeIncidentSla, evaluateSweep, SLA_WARN_FRACTION, slaTargetMinutes } from "./incidentSla";

export type InsightIncident = {
  id: string;
  severity: string;
  status: string;
  reportedAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  assigneeUserId: string | null;
  reporterEmail: string | null;
  slaWarnedAt: Date | null;
  slaBreachedAt: Date | null;
  lastReporterUpdateAt: Date | null;
  problemId: string | null;
};

export type IncidentInsights = {
  open: number;
  atRisk: number; // open, >= 75% of resolve window used, not yet breached
  breached: number;
  unassigned: number;
  reportersWaiting: number; // open with a reporter email who is overdue an update
  inProblem: number; // open incidents attached to a problem
  mttrLast30: number | null; // minutes
  mttrPrev30: number | null;
  mttrTrend: "improving" | "worsening" | "flat" | null;
};

function mttr(list: InsightIncident[]): number | null {
  const r = list.filter((i) => i.resolvedAt);
  if (!r.length) return null;
  return Math.round(r.reduce((s, i) => s + (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60_000, 0) / r.length);
}

export function computeIncidentInsights(incidents: InsightIncident[], now: Date = new Date()): IncidentInsights {
  const open = incidents.filter((i) => i.status !== "RESOLVED" && i.status !== "CLOSED");
  let atRisk = 0, breached = 0, unassigned = 0, reportersWaiting = 0;
  for (const i of open) {
    const sla = computeIncidentSla(i, now);
    const elapsed = (now.getTime() - i.reportedAt.getTime()) / 60_000;
    if (sla.resolveBreached) breached++;
    else if (elapsed >= slaTargetMinutes(i.severity).resolve * SLA_WARN_FRACTION) atRisk++;
    if (!i.assigneeUserId) unassigned++;
    if (evaluateSweep(i, now).nudgeReporterUpdate) reportersWaiting++;
  }

  const DAY = 86_400_000;
  const resolved = incidents.filter((i) => i.resolvedAt);
  const last = resolved.filter((i) => now.getTime() - i.resolvedAt!.getTime() <= 30 * DAY);
  const prev = resolved.filter((i) => {
    const age = now.getTime() - i.resolvedAt!.getTime();
    return age > 30 * DAY && age <= 60 * DAY;
  });
  const a = mttr(last), b = mttr(prev);
  let trend: IncidentInsights["mttrTrend"] = null;
  if (a != null && b != null) trend = a < b * 0.9 ? "improving" : a > b * 1.1 ? "worsening" : "flat";

  return {
    open: open.length, atRisk, breached, unassigned, reportersWaiting,
    inProblem: open.filter((i) => i.problemId).length,
    mttrLast30: a, mttrPrev30: b, mttrTrend: trend,
  };
}
