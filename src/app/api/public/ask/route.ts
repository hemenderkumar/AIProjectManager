import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityEvents } from "@/lib/db/schema";
import { askClaude } from "@/lib/ai";
import { logActivity } from "@/lib/activity";

const MAX_QUESTION_LENGTH = 400;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 12; // a real back-and-forth conversation needs more turns than the
// one-shot triage teaser, but this is still an anonymous, unauthenticated endpoint.

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// Public, no-login backing for the homepage's floating "AI PM" widget (PublicAvatarAssistant).
// Unlike /api/ai/ask (which grounds its answers in a logged-in user's real portfolio data and
// requires a session), this has no portfolio to ground in -- it's a marketing concierge: explain
// what Executa is, help a visitor figure out if/how it fits what they're doing, and nudge toward
// creating a free account or trying the "describe what's on your mind" classifier already on the
// page. Fed a small block of verified facts (kept in sync with the homepage's own FAQ/pricing
// copy) so it doesn't invent pricing or policy details for a visitor with no account yet.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Ask something first." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: `Keep it under ${MAX_QUESTION_LENGTH} characters.` }, { status: 400 });
  }

  const ip = clientIp(req);
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recent = await db
    .select({ id: activityEvents.id })
    .from(activityEvents)
    .where(and(eq(activityEvents.type, "PUBLIC_ASK"), eq(activityEvents.detail, `ip:${ip}`), gte(activityEvents.createdAt, windowStart)));

  if (recent.length >= RATE_LIMIT_MAX) {
    return NextResponse.json({ answer: "I've answered a lot of questions this session — give it a few minutes and ask again, or just create a free account to explore directly." });
  }

  await logActivity({ type: "PUBLIC_ASK", path: "/", detail: `ip:${ip}` });

  const system = `You are Executa's "AI PM" -- a friendly, concise product concierge embedded as a
floating chat widget on Executa's public marketing homepage, talking to a visitor who has NOT
created an account yet. You are not grounded in any real project data (there is none for an
anonymous visitor) -- you're here to explain the product and help them figure out if/how it fits
what they're working on.

Facts about Executa (don't invent anything beyond these):
- It's an AI-native project & portfolio delivery tracker: Ideation (brainstorm + AI feasibility
  gates) -> AI-drafted charter, RFP, SOW, and delivery plan (Waterfall, Scrum, or hybrid) ->
  Execution (sprints/phases, budget, risk, incident tracking) -> board-ready PDF/PPTX reports.
- It's different from Asana/Monday/Jira: those manage tasks once a project already exists;
  Executa also manages the decision to start one, with AI drafting the charter/RFP/SOW/plan
  instead of a blank template.
- Built-in RFP/vendor evaluation workflow and Statement of Work / Deliverables tracking.
- Individuals get instant, self-service access -- create an account and start immediately.
  Company accounts (multiple teammates, shared rate cards) are reviewed by an admin first.
- Every new account starts on a free trial, no credit card required.
- Security: role-based access scoped per organization, step-up MFA for sensitive finance/
  platform actions, immutable audit log.
- There's also a "describe what's on your mind" tool elsewhere on this same homepage that will
  classify a visitor's own idea/demand/project with AI right now, before they sign up.

Style: 2-4 sentences, plain and conversational (this renders in a small chat bubble, not a
document -- no headers, no bullet lists, no markdown). Answer what they actually asked first.
When it's a natural fit, end with a short, low-pressure nudge toward creating a free account
(individuals: instant access) or trying the on-page idea classifier -- but don't tack the same
nudge onto every single reply if the conversation is already heading that way; use judgment.
Never claim capabilities, pricing, or policies beyond the facts above.`;

  const answer = await askClaude(system, question, 350);
  return NextResponse.json({ answer });
}
