// Pure SLA/MTTR math for incidents -- no db import, so both the server (lib/incidents.ts,
// portfolio.ts) and the client (IncidentsBoard.tsx) can compute the same numbers without a
// round-trip. Targets are deliberately simple (severity -> two duration targets) rather than
// configurable per-org; see the product note on lib/incidents.ts for why that's a v1 choice.

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

// [minutes to acknowledge, minutes to resolve] by severity -- roughly modeled on common ITSM
// defaults (P1 page-now / P4 best-effort) but expressed in-app rather than pulled from a
// vendor's SLA catalog.
const SLA_TARGET_MINUTES: Record<IncidentSeverity, { ack: number; resolve: number }> = {
  CRITICAL: { ack: 30, resolve: 4 * 60 },
  HIGH: { ack: 2 * 60, resolve: 24 * 60 },
  MEDIUM: { ack: 8 * 60, resolve: 3 * 24 * 60 },
  LOW: { ack: 24 * 60, resolve: 7 * 24 * 60 },
};

export type SlaTargetOverrides = Partial<Record<IncidentSeverity, Partial<{ ack: number; resolve: number }>>>;

// Per-org override (organizations.slaTargets jsonb), validated so a bad value can never
// produce a zero/negative SLA window. Unknown severities and non-positive numbers are ignored.
export function sanitizeSlaOverrides(raw: unknown): SlaTargetOverrides {
  const out: SlaTargetOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  for (const sev of ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const) {
    const v = (raw as Record<string, unknown>)[sev];
    if (!v || typeof v !== "object") continue;
    const entry: Partial<{ ack: number; resolve: number }> = {};
    for (const k of ["ack", "resolve"] as const) {
      const n = (v as Record<string, unknown>)[k];
      if (typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 60 * 24 * 90) entry[k] = Math.round(n);
    }
    if (Object.keys(entry).length) out[sev] = entry;
  }
  return out;
}

export function slaTargetMinutes(severity: string, overrides?: SlaTargetOverrides): { ack: number; resolve: number } {
  const base = SLA_TARGET_MINUTES[severity as IncidentSeverity] ?? SLA_TARGET_MINUTES.MEDIUM;
  const o = overrides?.[severity as IncidentSeverity];
  return { ack: o?.ack ?? base.ack, resolve: o?.resolve ?? base.resolve };
}

export interface IncidentForSla {
  severity: string;
  status: string;
  reportedAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
}

export interface IncidentSlaResult {
  ackDueAt: Date;
  ackBreached: boolean; // true once past ackDueAt with no acknowledgedAt (and not already resolved)
  resolveDueAt: Date;
  resolveBreached: boolean; // true once past resolveDueAt while still open
  mttrMinutes: number | null; // minutes from reportedAt -> resolvedAt, only once resolved
}

export function computeIncidentSla(incident: IncidentForSla, now: Date = new Date(), overrides?: SlaTargetOverrides): IncidentSlaResult {
  const target = slaTargetMinutes(incident.severity, overrides);
  const ackDueAt = new Date(incident.reportedAt.getTime() + target.ack * 60_000);
  const resolveDueAt = new Date(incident.reportedAt.getTime() + target.resolve * 60_000);
  const isClosed = incident.status === "RESOLVED" || incident.status === "CLOSED";

  const ackBreached = !incident.acknowledgedAt && !isClosed && now.getTime() > ackDueAt.getTime();
  const resolveBreached = !isClosed && now.getTime() > resolveDueAt.getTime();

  const mttrMinutes = incident.resolvedAt
    ? Math.round((incident.resolvedAt.getTime() - incident.reportedAt.getTime()) / 60_000)
    : null;

  return { ackDueAt, ackBreached, resolveDueAt, resolveBreached, mttrMinutes };
}

// ---- proactive sweep decisions (pure) ---------------------------------------------------
export const SLA_WARN_FRACTION = 0.75;

// How often a still-open incident's reporter should hear from us, by severity (minutes).
const REPORTER_UPDATE_CADENCE: Record<IncidentSeverity, number> = {
  CRITICAL: 4 * 60,
  HIGH: 24 * 60,
  MEDIUM: 3 * 24 * 60,
  LOW: 7 * 24 * 60,
};

export interface IncidentForSweep extends IncidentForSla {
  assigneeUserId: string | null;
  reporterEmail: string | null;
  slaWarnedAt: Date | null;
  slaBreachedAt: Date | null;
  lastReporterUpdateAt: Date | null;
}

export interface SweepDecision {
  warn: boolean; // 75% of resolve window used, not yet warned
  breach: boolean; // resolve window passed, not yet recorded
  ackBreach: boolean; // never acknowledged past ack window (informational; drives the escalate)
  unassigned: boolean; // open and nobody owns it
  nudgeReporterUpdate: boolean; // reporter known and overdue for an update
}

export function evaluateSweep(i: IncidentForSweep, now: Date, overrides?: SlaTargetOverrides): SweepDecision {
  const closed = i.status === "RESOLVED" || i.status === "CLOSED";
  const none: SweepDecision = { warn: false, breach: false, ackBreach: false, unassigned: false, nudgeReporterUpdate: false };
  if (closed) return none;

  const target = slaTargetMinutes(i.severity, overrides);
  const elapsedMin = (now.getTime() - i.reportedAt.getTime()) / 60_000;
  const sla = computeIncidentSla(i, now, overrides);

  const breach = sla.resolveBreached && !i.slaBreachedAt;
  const warn = !breach && !sla.resolveBreached && !i.slaWarnedAt && elapsedMin >= target.resolve * SLA_WARN_FRACTION;
  const unassigned = !i.assigneeUserId && elapsedMin >= target.ack / 2;

  const cadence = REPORTER_UPDATE_CADENCE[i.severity as IncidentSeverity] ?? REPORTER_UPDATE_CADENCE.MEDIUM;
  const lastTouch = i.lastReporterUpdateAt ?? i.reportedAt;
  const nudgeReporterUpdate = !!i.reporterEmail && (now.getTime() - lastTouch.getTime()) / 60_000 >= cadence;

  return { warn, breach, ackBreach: sla.ackBreached, unassigned, nudgeReporterUpdate };
}

const SEVERITY_LADDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export function nextSeverity(severity: string): string {
  const idx = SEVERITY_LADDER.indexOf(severity as (typeof SEVERITY_LADDER)[number]);
  return idx < 0 ? severity : SEVERITY_LADDER[Math.min(idx + 1, SEVERITY_LADDER.length - 1)];
}

// Average MTTR (in minutes) across a set of incidents that have a resolvedAt -- returns null
// if none are resolved yet rather than dividing by zero.
export function averageMttrMinutes(incidents: IncidentForSla[]): number | null {
  const resolved = incidents.filter((i) => i.resolvedAt);
  if (resolved.length === 0) return null;
  const total = resolved.reduce((sum, i) => sum + (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60_000, 0);
  return Math.round(total / resolved.length);
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 24 * 60) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / (24 * 60)).toFixed(1)}d`;
}
