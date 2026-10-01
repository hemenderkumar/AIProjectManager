import { db } from "./db";
import { escalations, projects } from "./db/schema";
import { eq, ne } from "drizzle-orm";

// Formats every open/in-progress escalation across the portfolio for the steering committee
// report prompt -- see escalations in schema.ts and generateSteeringCommitteeReport in
// reportGenerator.ts. Deliberately unscoped (whole portfolio), same reasoning as
// getPortfolioSummary() when called from the unscoped report generators.
export async function formatOpenEscalationsForAI(): Promise<string> {
  const rows = await db
    .select({
      title: escalations.title,
      description: escalations.description,
      severity: escalations.severity,
      status: escalations.status,
      owner: escalations.owner,
      projectName: projects.name,
    })
    .from(escalations)
    .innerJoin(projects, eq(escalations.projectId, projects.id))
    .where(ne(escalations.status, "RESOLVED"));

  if (rows.length === 0) return "No open escalations logged.";

  return rows
    .map(
      (r) =>
        `- [${r.severity}] "${r.title}" (${r.projectName}, ${r.status}${r.owner ? `, owner: ${r.owner}` : ""})${r.description ? ` — ${r.description}` : ""}`
    )
    .join("\n");
}
