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

export function slaTargetMinutes(severity: string): { ack: number; resolve: number } {
  return SLA_TARGET_MINUTES[severity as IncidentSeverity] ?? SLA_TARGET_MINUTES.MEDIUM;
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

export function computeIncidentSla(incident: IncidentForSla, now: Date = new Date()): IncidentSlaResult {
  const target = slaTargetMinutes(incident.severity);
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
