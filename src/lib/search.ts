import { db } from "./db";
import { projects, tasks, deliverables, riskItems } from "./db/schema";
import { and, inArray, sql } from "drizzle-orm";
import { listVisibleProjects } from "./tenancy";
import type { SessionUser } from "./auth";

// Global (cmd+K) search across the entity types someone actually hunts for during a project:
// projects, tasks, deliverables, risks. Scoped through the exact same listVisibleProjects()
// used everywhere else (portfolio.ts, tenancy.ts) so search can never leak a project a user
// wouldn't otherwise be able to open.
//
// Uses Postgres's built-in to_tsvector/plainto_tsquery computed at query time rather than a
// stored generated tsvector column + GIN index -- correct full-text ranking today, with the
// GIN index as a purely additive follow-up once result volume actually makes it slow (see
// add-search-and-templates.sql for where that index would go).
export type SearchResult = {
  type: "project" | "task" | "deliverable" | "risk";
  id: string;
  projectId: string;
  title: string;
  snippet: string | null;
  rank: number;
};

export async function globalSearch(user: SessionUser | null | undefined, query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const visible = await listVisibleProjects(user);
  if (!visible.length) return [];
  const projectIds = visible.map((p) => p.id);

  const tsQuery = sql`plainto_tsquery('english', ${q})`;
  const matchesText = (col: ReturnType<typeof sql>) => sql`to_tsvector('english', coalesce(${col}, '')) @@ ${tsQuery}`;
  const rankOf = (col: ReturnType<typeof sql>) => sql<number>`ts_rank(to_tsvector('english', coalesce(${col}, '')), ${tsQuery})`;

  const [projectRows, taskRows, deliverableRows, riskRows] = await Promise.all([
    db
      .select({
        id: projects.id,
        title: projects.name,
        snippet: projects.description,
        rank: rankOf(sql`${projects.name} || ' ' || coalesce(${projects.description}, '')`),
      })
      .from(projects)
      .where(
        and(
          inArray(projects.id, projectIds),
          matchesText(sql`${projects.name} || ' ' || coalesce(${projects.description}, '')`)
        )
      )
      .limit(10),
    db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        title: tasks.title,
        snippet: tasks.description,
        rank: rankOf(sql`${tasks.title} || ' ' || coalesce(${tasks.description}, '')`),
      })
      .from(tasks)
      .where(
        and(
          inArray(tasks.projectId, projectIds),
          matchesText(sql`${tasks.title} || ' ' || coalesce(${tasks.description}, '')`)
        )
      )
      .limit(10),
    db
      .select({
        id: deliverables.id,
        projectId: deliverables.projectId,
        title: deliverables.title,
        snippet: deliverables.executiveSummary,
        rank: rankOf(sql`${deliverables.title} || ' ' || coalesce(${deliverables.executiveSummary}, '') || ' ' || coalesce(${deliverables.content}, '')`),
      })
      .from(deliverables)
      .where(
        and(
          inArray(deliverables.projectId, projectIds),
          matchesText(sql`${deliverables.title} || ' ' || coalesce(${deliverables.executiveSummary}, '') || ' ' || coalesce(${deliverables.content}, '')`)
        )
      )
      .limit(10),
    db
      .select({
        id: riskItems.id,
        projectId: riskItems.projectId,
        title: riskItems.description,
        snippet: riskItems.mitigation,
        rank: rankOf(sql`coalesce(${riskItems.description}, '') || ' ' || coalesce(${riskItems.mitigation}, '')`),
      })
      .from(riskItems)
      .where(
        and(
          inArray(riskItems.projectId, projectIds),
          matchesText(sql`coalesce(${riskItems.description}, '') || ' ' || coalesce(${riskItems.mitigation}, '')`)
        )
      )
      .limit(10),
  ]);

  const results: SearchResult[] = [
    ...projectRows.map((r) => ({ type: "project" as const, id: r.id, projectId: r.id, title: r.title, snippet: r.snippet, rank: Number(r.rank) })),
    ...taskRows.map((r) => ({ type: "task" as const, id: r.id, projectId: r.projectId, title: r.title, snippet: r.snippet, rank: Number(r.rank) })),
    ...deliverableRows.map((r) => ({ type: "deliverable" as const, id: r.id, projectId: r.projectId, title: r.title, snippet: r.snippet, rank: Number(r.rank) })),
    ...riskRows.map((r) => ({ type: "risk" as const, id: r.id, projectId: r.projectId, title: r.title ?? "(untitled risk)", snippet: r.snippet, rank: Number(r.rank) })),
  ];

  return results.sort((a, b) => b.rank - a.rank).slice(0, 30);
}
