import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/brandedEmail", () => ({ sendBrandedEmail: vi.fn() }));

import { tokenize, jaccard, findSimilarIncidents, resolutionEvidence, detectRecurrence, type IncidentLike } from "@/lib/incidentSimilarity";
import { evaluateSweep, nextSeverity, sanitizeSlaOverrides, slaTargetMinutes, validateSlaTargetsInput, type IncidentForSweep } from "@/lib/incidentSla";
import { computeIncidentInsights } from "@/lib/incidentInsights";
import { extractEmail } from "@/lib/incidentComms";

const NOW = new Date("2026-11-04T12:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const inc = (o: Partial<IncidentLike> & { id: string; title: string }): IncidentLike => ({
  severity: "MEDIUM", status: "OPEN", projectId: "p1", reportedAt: ago(60), ...o,
});

describe("similarity", () => {
  it("tokenizes with stemming and stopwords", () => {
    expect(tokenize("The login timeouts are failing")).toEqual(expect.arrayContaining(["login", "timeout"]));
    expect(tokenize("the and of")).toEqual([]);
  });
  it("jaccard handles empties", () => {
    expect(jaccard([], ["a"])).toBe(0);
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
  });
  it("finds similar incidents and ignores unrelated ones", () => {
    const target = inc({ id: "t", title: "Checkout payment timeout" });
    const res = findSimilarIncidents(target, [
      inc({ id: "a", title: "Payment timeout at checkout", status: "RESOLVED", resolutionNotes: "Restarted gateway", resolvedAt: ago(10) }),
      inc({ id: "b", title: "Logo is blurry on homepage" }),
      target,
    ]);
    expect(res.map((r) => r.incident.id)).toEqual(["a"]);
    const ev = resolutionEvidence(res);
    expect(ev[0]).toMatchObject({ incidentId: "a", notes: "Restarted gateway", minutesToResolve: 50 });
  });
  it("detects recurrence clusters of 3+ unlinked incidents", () => {
    const list = [
      inc({ id: "1", title: "Export fails with timeout", reportedAt: ago(100) }),
      inc({ id: "2", title: "Export timeout again", reportedAt: ago(200) }),
      inc({ id: "3", title: "Timeout during export", reportedAt: ago(300) }),
      inc({ id: "4", title: "Billing page typo" }),
      inc({ id: "5", title: "Export timeout", problemId: "pr", reportedAt: ago(50) }),
    ];
    const c = detectRecurrence(list, { now: NOW });
    expect(c).toHaveLength(1);
    expect(c[0].incidentIds.sort()).toEqual(["1", "2", "3"]);
  });
});

describe("sla sweep", () => {
  const base: IncidentForSweep = {
    severity: "HIGH", status: "OPEN", reportedAt: ago(0), acknowledgedAt: null, resolvedAt: null,
    assigneeUserId: "u1", reporterEmail: null, slaWarnedAt: null, slaBreachedAt: null, lastReporterUpdateAt: null,
  };
  const HIGH_RESOLVE = 24 * 60;

  it("warns at 75% once, breaches after the window once", () => {
    expect(evaluateSweep({ ...base, reportedAt: ago(HIGH_RESOLVE * 0.5) }, NOW).warn).toBe(false);
    expect(evaluateSweep({ ...base, reportedAt: ago(HIGH_RESOLVE * 0.8) }, NOW).warn).toBe(true);
    expect(evaluateSweep({ ...base, reportedAt: ago(HIGH_RESOLVE * 0.8), slaWarnedAt: ago(5) }, NOW).warn).toBe(false);
    const breached = evaluateSweep({ ...base, reportedAt: ago(HIGH_RESOLVE + 5) }, NOW);
    expect(breached).toMatchObject({ breach: true, warn: false });
    expect(evaluateSweep({ ...base, reportedAt: ago(HIGH_RESOLVE + 5), slaBreachedAt: ago(1) }, NOW).breach).toBe(false);
  });
  it("ignores closed incidents", () => {
    expect(evaluateSweep({ ...base, status: "RESOLVED", reportedAt: ago(HIGH_RESOLVE * 5) }, NOW)).toMatchObject({ warn: false, breach: false });
  });
  it("flags unassigned and reporter-update nudges", () => {
    expect(evaluateSweep({ ...base, assigneeUserId: null, reportedAt: ago(120) }, NOW).unassigned).toBe(true);
    const waiting = { ...base, reporterEmail: "a@b.co", reportedAt: ago(HIGH_RESOLVE / 2 + 60) };
    expect(evaluateSweep(waiting, NOW).nudgeReporterUpdate).toBe(false); // 12h+ < 24h cadence
    expect(evaluateSweep({ ...waiting, reportedAt: ago(25 * 60) }, NOW).nudgeReporterUpdate).toBe(true);
    expect(evaluateSweep({ ...waiting, reportedAt: ago(25 * 60), lastReporterUpdateAt: ago(60) }, NOW).nudgeReporterUpdate).toBe(false);
  });
  it("escalates one severity step, capped at CRITICAL", () => {
    expect(nextSeverity("LOW")).toBe("MEDIUM");
    expect(nextSeverity("HIGH")).toBe("CRITICAL");
    expect(nextSeverity("CRITICAL")).toBe("CRITICAL");
  });
  it("applies only sane per-org overrides", () => {
    const o = sanitizeSlaOverrides({ HIGH: { ack: 10, resolve: 120 }, LOW: { ack: -5, resolve: "x" }, BOGUS: { ack: 1 } });
    expect(o).toEqual({ HIGH: { ack: 10, resolve: 120 } });
    expect(slaTargetMinutes("HIGH", o)).toEqual({ ack: 10, resolve: 120 });
    expect(slaTargetMinutes("LOW", o)).toEqual(slaTargetMinutes("LOW"));
  });
});

describe("sla target admin input", () => {
  it("converts hours to minutes and clears blanks", () => {
    expect(validateSlaTargetsInput({ HIGH: { ack: "2", resolve: 12 }, LOW: { ack: "", resolve: "" } })).toEqual({
      ok: true, value: { HIGH: { ack: 120, resolve: 720 } },
    });
    expect(validateSlaTargetsInput(null)).toEqual({ ok: true, value: null });
    expect(validateSlaTargetsInput({})).toEqual({ ok: true, value: null });
  });
  it("rejects bad numbers and ack > resolve", () => {
    expect(validateSlaTargetsInput({ HIGH: { ack: "abc" } })).toMatchObject({ ok: false });
    expect(validateSlaTargetsInput({ HIGH: { resolve: 99999 } })).toMatchObject({ ok: false });
    expect(validateSlaTargetsInput({ HIGH: { ack: 30, resolve: 10 } })).toMatchObject({ ok: false });
    // ack above the *default* resolve for that severity is also invalid
    expect(validateSlaTargetsInput({ CRITICAL: { ack: 10 } })).toMatchObject({ ok: false });
  });
});

describe("insights + reporter email", () => {
  it("summarizes open work and MTTR trend", () => {
    const mk = (id: string, o: Record<string, unknown>) => ({
      id, severity: "HIGH", status: "OPEN", reportedAt: ago(60), acknowledgedAt: null, resolvedAt: null, assigneeUserId: null,
      reporterEmail: null, slaWarnedAt: null, slaBreachedAt: null, lastReporterUpdateAt: null, problemId: null, ...o,
    }) as never;
    const day = 24 * 60;
    const r = computeIncidentInsights([
      mk("a", { reportedAt: ago(day * 2) }), // breached HIGH (24h)
      mk("b", { reportedAt: ago(day * 0.8), assigneeUserId: "u" }), // at risk
      mk("c", { status: "RESOLVED", reportedAt: ago(day * 3), resolvedAt: ago(day * 2) }), // recent: 1d
      mk("d", { status: "RESOLVED", reportedAt: ago(day * 40 + day * 3), resolvedAt: ago(day * 40) }), // prev: 3d
    ], NOW);
    expect(r).toMatchObject({ open: 2, breached: 1, atRisk: 1, unassigned: 1, mttrTrend: "improving" });
  });
  it("extracts emails from free text", () => {
    expect(extractEmail("Jane <Jane@X.com>")).toBe("jane@x.com");
    expect(extractEmail("bob@x.com")).toBe("bob@x.com");
    expect(extractEmail("Just a name")).toBeNull();
    expect(extractEmail(null)).toBeNull();
  });
});
