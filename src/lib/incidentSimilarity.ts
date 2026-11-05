// Pure similarity + recurrence helpers for incidents (no db import, unit-testable).
// Deliberately keyword/Jaccard based rather than embeddings: zero cost, zero latency, and good
// enough to surface "we've seen this before" for ops-style titles ("login timeout", "export fails").

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "were", "be", "it", "this",
  "that", "with", "not", "no", "cannot", "cant", "can", "when", "after", "before", "from", "at", "by", "as",
  "error", "issue", "problem", "failed", "failure", "failing", "fails", "unable", "please", "help",
]);

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !STOPWORDS.has(t))
        // crude stemming: plural / -ing / -ed so "timeouts" ~ "timeout"
        .map((t) => t.replace(/(ing|ed|es|s)$/, "")),
    ),
  );
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  let inter = 0;
  for (const t of a) if (sb.has(t)) inter++;
  return inter / (a.length + b.length - inter);
}

export type IncidentLike = {
  id: string;
  title: string;
  description?: string | null;
  severity: string;
  status: string;
  projectId: string | null;
  resolutionNotes?: string | null;
  reportedAt: Date;
  resolvedAt?: Date | null;
  problemId?: string | null;
};

// Title tokens count double -- titles are the densest signal in an incident.
function signature(i: Pick<IncidentLike, "title" | "description">): string[] {
  const title = tokenize(i.title);
  const desc = tokenize(i.description).slice(0, 25);
  return [...title, ...title, ...desc];
}

export type SimilarIncident = { incident: IncidentLike; score: number; sameProject: boolean };

export function findSimilarIncidents(
  target: IncidentLike,
  candidates: IncidentLike[],
  opts: { minScore?: number; limit?: number } = {},
): SimilarIncident[] {
  const minScore = opts.minScore ?? 0.22;
  const limit = opts.limit ?? 5;
  const sigT = signature(target);
  return candidates
    .filter((c) => c.id !== target.id)
    .map((c) => {
      const sameProject = !!target.projectId && target.projectId === c.projectId;
      const base = jaccard(sigT, signature(c));
      // same project is a mild boost; never enough to match unrelated text on its own
      return { incident: c, score: base + (base > 0 && sameProject ? 0.08 : 0), sameProject };
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Resolved incidents with notes are the useful "how was this fixed before" evidence.
export function resolutionEvidence(similar: SimilarIncident[]) {
  return similar
    .filter((s) => s.incident.resolutionNotes && (s.incident.status === "RESOLVED" || s.incident.status === "CLOSED"))
    .map((s) => ({
      incidentId: s.incident.id,
      title: s.incident.title,
      notes: s.incident.resolutionNotes as string,
      minutesToResolve:
        s.incident.resolvedAt ? Math.round((s.incident.resolvedAt.getTime() - s.incident.reportedAt.getTime()) / 60_000) : null,
      score: s.score,
    }));
}

export type RecurrenceCluster = { key: string; incidentIds: string[]; titles: string[]; projectId: string | null };

// Groups incidents (not already attached to a problem) that look alike inside a time window.
// A cluster of >= minCount is a candidate problem.
export function detectRecurrence(
  incidents: IncidentLike[],
  opts: { windowDays?: number; minCount?: number; threshold?: number; now?: Date } = {},
): RecurrenceCluster[] {
  const now = opts.now ?? new Date();
  const windowMs = (opts.windowDays ?? 30) * 86_400_000;
  const minCount = opts.minCount ?? 3;
  const threshold = opts.threshold ?? 0.3;
  const pool = incidents.filter((i) => !i.problemId && now.getTime() - i.reportedAt.getTime() <= windowMs);

  const used = new Set<string>();
  const clusters: RecurrenceCluster[] = [];
  for (const seed of pool) {
    if (used.has(seed.id)) continue;
    const group = pool.filter((o) => o.id === seed.id || (!used.has(o.id) && jaccard(signature(seed), signature(o)) >= threshold));
    if (group.length >= minCount) {
      group.forEach((g) => used.add(g.id));
      clusters.push({
        key: seed.id,
        incidentIds: group.map((g) => g.id),
        titles: group.map((g) => g.title),
        projectId: seed.projectId,
      });
    }
  }
  return clusters.sort((a, b) => b.incidentIds.length - a.incidentIds.length);
}
