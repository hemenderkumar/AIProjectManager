import { eq, inArray, notInArray } from "drizzle-orm";
import { db } from "./db";
import { incidents, incidentUpdates, organizations, projectMembers, projects, users } from "./db/schema";
import { evaluateSweep, nextSeverity, sanitizeSlaOverrides, formatMinutes, slaTargetMinutes, type SlaTargetOverrides } from "./incidentSla";
import { notify } from "./notifications";
import { notifyReporter } from "./incidentComms";
import { dispatchWebhook } from "./webhooks";

export type SweepSummary = { checked: number; warned: number; breached: number; escalated: number; reporterNudges: number; reporterNotices: number };

// Proactive pass over every open incident. Safe to run repeatedly: warn / breach are stamped
// once (slaWarnedAt / slaBreachedAt) so nobody is notified twice for the same threshold.
export async function runIncidentSweep(now: Date = new Date()): Promise<SweepSummary> {
  const open = await db.select().from(incidents).where(notInArray(incidents.status, ["RESOLVED", "CLOSED"]));
  const summary: SweepSummary = { checked: open.length, warned: 0, breached: 0, escalated: 0, reporterNudges: 0, reporterNotices: 0 };
  if (!open.length) return summary;

  const projectIds = Array.from(new Set(open.map((i) => i.projectId).filter((x): x is string => !!x)));
  const projRows = projectIds.length
    ? await db.select({ id: projects.id, organizationId: projects.organizationId }).from(projects).where(inArray(projects.id, projectIds))
    : [];
  const orgOfProject = new Map(projRows.map((p) => [p.id, p.organizationId]));
  const orgIds = Array.from(new Set(projRows.map((p) => p.organizationId).filter((x): x is string => !!x)));
  const orgRows = orgIds.length
    ? await db.select({ id: organizations.id, slaTargets: organizations.slaTargets }).from(organizations).where(inArray(organizations.id, orgIds))
    : [];
  const overridesByOrg = new Map<string, SlaTargetOverrides>(orgRows.map((o) => [o.id, sanitizeSlaOverrides(o.slaTargets)]));

  const memberRows = projectIds.length
    ? await db
        .select({ projectId: projectMembers.projectId, id: users.id, email: users.email, role: users.role, organizationId: users.organizationId })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(inArray(projectMembers.projectId, projectIds))
    : [];

  for (const inc of open) {
    const orgId = inc.projectId ? orgOfProject.get(inc.projectId) ?? null : null;
    const overrides = orgId ? overridesByOrg.get(orgId) : undefined;
    const d = evaluateSweep(inc, now, overrides);
    if (!d.warn && !d.breach && !d.nudgeReporterUpdate && !(d.unassigned && d.ackBreach)) continue;

    // Who to tell: the assignee, plus PM+ project members (so unowned incidents still surface).
    const members = memberRows.filter((m) => m.projectId === inc.projectId && (m.role === "PM" || m.role === "SUPER_USER" || m.role === "ADMIN" || m.organizationId == null));
    const recipients = new Map<string, string>();
    if (inc.assigneeUserId) {
      const [a] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, inc.assigneeUserId));
      if (a) recipients.set(a.id, a.email);
    }
    if (!inc.assigneeUserId || d.breach) members.forEach((m) => recipients.set(m.id, m.email));
    const link = "/support";
    const target = slaTargetMinutes(inc.severity, overrides);

    const tell = async (title: string, body: string) => {
      await Promise.all(Array.from(recipients, ([userId, email]) => notify({ userId, type: "AUTOMATION", title, body, link, email })));
    };

    if (d.breach) {
      const sev = nextSeverity(inc.severity);
      const escalating = sev !== inc.severity;
      await db
        .update(incidents)
        .set({
          slaBreachedAt: now,
          ...(escalating ? { severity: sev as typeof inc.severity } : {}),
          ...(sev === "CRITICAL" && !inc.escalatedAt ? { escalatedAt: now } : {}),
        })
        .where(eq(incidents.id, inc.id));
      await db.insert(incidentUpdates).values({
        incidentId: inc.id,
        authorName: "Executa (SLA)",
        body: `Resolution SLA (${formatMinutes(target.resolve)}) breached.${escalating ? ` Severity raised ${inc.severity} → ${sev}.` : ""}`,
        visibility: "INTERNAL",
      });
      await tell(`SLA breached: ${inc.title}`, `Resolution target of ${formatMinutes(target.resolve)} has passed.${escalating ? ` Escalated to ${sev}.` : ""}`);
      summary.breached++;
      if (escalating) {
        summary.escalated++;
        await dispatchWebhook(orgId, "INCIDENT_ESCALATED", { id: inc.id, title: inc.title, severity: sev, projectId: inc.projectId });
      }
      if (inc.reporterEmail) {
        const ok = await notifyReporter(inc.id, {
          subject: "Your issue is taking longer than expected",
          heading: "We haven't forgotten about you",
          paragraphs: ["Your issue is taking longer to resolve than we'd like. It has been escalated and we'll update you as soon as we have progress."],
        });
        if (ok) summary.reporterNotices++;
      }
      continue;
    }

    if (d.warn) {
      await db.update(incidents).set({ slaWarnedAt: now }).where(eq(incidents.id, inc.id));
      await tell(`SLA at risk: ${inc.title}`, `75% of the ${formatMinutes(target.resolve)} resolution window has elapsed.`);
      summary.warned++;
    } else if (d.unassigned && d.ackBreach) {
      await tell(`Unassigned and unacknowledged: ${inc.title}`, `No one has picked this up and the ${formatMinutes(target.ack)} acknowledgement target has passed.`);
    }

    if (d.nudgeReporterUpdate && inc.assigneeUserId) {
      await tell(`Reporter needs an update: ${inc.title}`, "The reporter hasn't heard from us recently. Post a Public update on the incident timeline.");
      summary.reporterNudges++;
    }
  }
  return summary;
}
