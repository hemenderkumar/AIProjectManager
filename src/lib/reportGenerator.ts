import { db } from "@/lib/db";
import { reports, users } from "@/lib/db/schema";
import { askClaude } from "@/lib/ai";
import { getPortfolioSummary, formatPortfolioForAI } from "@/lib/portfolio";
import { sendEmail } from "@/lib/email";
import { inArray } from "drizzle-orm";

// `styleAddendum` is an optional saved STYLE_PRESET instruction (see lib/contentTemplates.ts,
// entityType STATUS_REPORT) appended to the base prompt — only ever supplied by the manual
// "generate now" flow (POST /api/reports/generate), never by the unscoped scheduled cron
// (src/app/api/cron/weekly-report), which has no logged-in user to look a preset up for.
export async function generateWeeklyStatusReport(styleAddendum?: string | null) {
  // Intentionally unscoped (no user passed): this is a scheduled, internal PMO report
  // covering the whole portfolio, not something generated on behalf of a specific
  // (possibly client-scoped) logged-in user.
  const summary = await getPortfolioSummary();
  const context = formatPortfolioForAI(summary);

  const system = `You are a PMO director preparing a weekly status report for C-level executives.
Write in a crisp, executive tone: short paragraphs, no fluff, lead with the bottom line.
Structure with Markdown headings: Executive Summary, Portfolio Health, Key Risks & Blockers,
Budget Snapshot, Recommended Actions. Call out RED/YELLOW projects explicitly.${styleAddendum ? `\n\nAdditional style guidance: ${styleAddendum}` : ""}`;

  const content = await askClaude(system, `Weekly portfolio snapshot:\n\n${context}`);

  const [saved] = await db
    .insert(reports)
    .values({
      type: "WEEKLY_STATUS",
      title: `Weekly status report — ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`,
      content,
    })
    .returning();

  await emailToLeadership(saved.title, content);
  return saved;
}

export async function generateSteeringCommitteeReport(styleAddendum?: string | null) {
  // Same reasoning as generateWeeklyStatusReport above — intentionally unscoped.
  const summary = await getPortfolioSummary();
  const context = formatPortfolioForAI(summary);

  const system = `You are a PMO director preparing a steering committee meeting pack.
Structure with Markdown headings: Meeting Purpose, Decisions Needed, Portfolio Health Summary,
Escalations (risks/blockers that need committee-level help), Budget Overview, Proposed Agenda
(numbered, with rough minutes each). Be decisive about what the committee should actually decide.${styleAddendum ? `\n\nAdditional style guidance: ${styleAddendum}` : ""}`;

  const content = await askClaude(system, `Portfolio data for the steering committee pack:\n\n${context}`);

  const [saved] = await db
    .insert(reports)
    .values({
      type: "STEERING_COMMITTEE",
      title: `Steering committee pack — ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`,
      content,
    })
    .returning();

  await emailToLeadership(saved.title, content);
  return saved;
}

async function emailToLeadership(subject: string, content: string) {
  const leaders = await db
    .select()
    .from(users)
    .where(inArray(users.role, ["ADMIN", "PM"]));

  for (const leader of leaders) {
    await sendEmail(leader.email, subject, content);
  }
}
