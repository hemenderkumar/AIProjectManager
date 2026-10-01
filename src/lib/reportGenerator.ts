import { db } from "@/lib/db";
import { reports, users } from "@/lib/db/schema";
import { askClaude } from "@/lib/ai";
import { getPortfolioSummary, formatPortfolioForAI } from "@/lib/portfolio";
import { formatOpenEscalationsForAI } from "@/lib/escalations";
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
  // Real tracked escalations (see escalations table) rather than leaving the AI to infer
  // "escalation-worthy" content purely from risks/overdue tasks.
  const openEscalations = await formatOpenEscalationsForAI();

  const system = `You are a PMO director preparing a steering committee meeting pack.
Structure with Markdown headings: Meeting Purpose, Decisions Needed, Portfolio Health Summary,
Escalations (list the tracked open escalations given below verbatim-ish, grouped by project;
only add inferred items if something in the portfolio data clearly needs committee-level help
beyond what's tracked), Budget Overview, Proposed Agenda (numbered, with rough minutes each).
Be decisive about what the committee should actually decide.${styleAddendum ? `\n\nAdditional style guidance: ${styleAddendum}` : ""}`;

  const content = await askClaude(
    system,
    `Portfolio data for the steering committee pack:\n\n${context}\n\nTracked open escalations:\n${openEscalations}`
  );

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

// PRINCE2-named reports -- only offered when settings.terminologyMode is "PRINCE2" (checked by
// the caller, /api/reports/generate). Same generation/storage/email pipeline as the two
// reports above, just PRINCE2 section headings in the system prompt.
export async function generatePrince2HighlightReport(styleAddendum?: string | null) {
  const summary = await getPortfolioSummary();
  const context = formatPortfolioForAI(summary);

  const system = `You are a PRINCE2 Project Manager preparing a Highlight Report for the Project Board.
Structure with Markdown headings: This Period's Summary, Progress Against Plan (RAG per project),
Products Completed This Period, Issues and Risks, Products Planned for Next Period, Budget/Tolerance
Status (flag anything forecast to breach agreed tolerance). Keep it factual and concise -- a
Highlight Report informs the Board, it doesn't ask them to decide anything.${styleAddendum ? `\n\nAdditional style guidance: ${styleAddendum}` : ""}`;

  const content = await askClaude(system, `Portfolio data for the Highlight Report:\n\n${context}`);

  const [saved] = await db
    .insert(reports)
    .values({
      type: "PRINCE2_HIGHLIGHT",
      title: `Highlight Report — ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`,
      content,
    })
    .returning();

  await emailToLeadership(saved.title, content);
  return saved;
}

export async function generatePrince2EndStageReport(styleAddendum?: string | null) {
  const summary = await getPortfolioSummary();
  const context = formatPortfolioForAI(summary);

  const system = `You are a PRINCE2 Project Manager preparing an End Stage Report for the Project Board, to be
reviewed alongside a Stage Boundary approval decision. Structure with Markdown headings: Stage
Objectives Achieved, Product Status (what was delivered vs. planned), Review of the Business
Case (is it still viable), Review of Risks and Issues, Lessons Report Summary, Follow-On Action
Recommendations, Next Stage Plan Recommendation (should the Board authorize the next stage).
Be explicit about the go/no-go recommendation for each project nearing a stage boundary.${styleAddendum ? `\n\nAdditional style guidance: ${styleAddendum}` : ""}`;

  const content = await askClaude(system, `Portfolio data for the End Stage Report:\n\n${context}`);

  const [saved] = await db
    .insert(reports)
    .values({
      type: "PRINCE2_END_STAGE",
      title: `End Stage Report — ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`,
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
