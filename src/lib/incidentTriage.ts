import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "./db";
import { incidents, incidentUpdates, problems } from "./db/schema";
import { findSimilarIncidents, resolutionEvidence, type IncidentLike } from "./incidentSimilarity";
import { notifyReporter } from "./incidentComms";

// Runs once when an incident is created. Looks at recent history in the same scope (same
// project, or unlinked incidents when there's no project) and:
//  - links the incident to a matching KNOWN_ERROR problem and tells the reporter the workaround
//  - otherwise leaves an internal "seen before" note with how similar incidents were resolved
// Best-effort: a failure here must never block incident creation.
export async function autoTriageIncident(incidentId: string) {
  try {
    const [inc] = await db.select().from(incidents).where(eq(incidents.id, incidentId));
    if (!inc) return;

    const since = new Date(Date.now() - 180 * 86_400_000);
    const scope = inc.projectId ? eq(incidents.projectId, inc.projectId) : isNull(incidents.projectId);
    const history = (await db
      .select()
      .from(incidents)
      .where(and(scope, gte(incidents.reportedAt, since)))
      .orderBy(desc(incidents.reportedAt))
      .limit(500)) as IncidentLike[];

    const similar = findSimilarIncidents(inc as IncidentLike, history);
    if (!similar.length) return;

    const problemIds = Array.from(new Set(similar.map((s) => s.incident.problemId).filter((x): x is string => !!x)));
    let knownError: typeof problems.$inferSelect | undefined;
    for (const pid of problemIds) {
      const [p] = await db.select().from(problems).where(eq(problems.id, pid));
      if (p && p.status === "KNOWN_ERROR") { knownError = p; break; }
    }

    if (knownError) {
      await db.update(incidents).set({ problemId: knownError.id }).where(eq(incidents.id, incidentId));
      await db.insert(incidentUpdates).values({
        incidentId,
        authorName: "Executa (auto-triage)",
        body: `Matches known error "${knownError.title}".${knownError.workaround ? `\nWorkaround: ${knownError.workaround}` : ""}${knownError.runbook ? `\nRunbook:\n${knownError.runbook}` : ""}`,
        visibility: "INTERNAL",
      });
      if (knownError.workaround) {
        await notifyReporter(incidentId, {
          subject: "We're aware of this issue",
          heading: "This is a known issue",
          paragraphs: [
            `We've seen this before and are working on a permanent fix ("${knownError.title}").`,
            `In the meantime, this workaround may help: ${knownError.workaround}`,
            "Reply to this email if it doesn't resolve things for you.",
          ],
        });
      }
      return;
    }

    const evidence = resolutionEvidence(similar);
    const lines = similar.slice(0, 3).map((s) => `• ${s.incident.title} (${s.incident.status}, ${Math.round(s.score * 100)}% match)`);
    const fixes = evidence.slice(0, 2).map((e) => `• "${e.title}" was resolved with: ${e.notes.slice(0, 300)}`);
    await db.insert(incidentUpdates).values({
      incidentId,
      authorName: "Executa (auto-triage)",
      body: `Similar incidents seen before:\n${lines.join("\n")}${fixes.length ? `\n\nHow they were fixed:\n${fixes.join("\n")}` : ""}`,
      visibility: "INTERNAL",
    });
  } catch (err) {
    console.error("autoTriageIncident failed", err);
  }
}
