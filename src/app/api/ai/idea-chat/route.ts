import { NextRequest, NextResponse } from "next/server";
import { AI_MODEL, getAnthropic } from "@/lib/ai";
import { requireProjectAccess } from "@/lib/tenancy";
import { getProjectDetail } from "@/lib/portfolio";
import { computeIdeaCost, IDEA_CHAT_FIELDS, sanitizeChatChanges, ideaReadiness } from "@/lib/ideaEvaluation";

export const maxDuration = 60;

const SCOPE_FIELDS: Record<string, string[] | undefined> = {
  hub: undefined,
  feasibility: ["feasibilityNotes", "feasibilityScore", "currentTechLandscape", "recommendedTechnology", "buildMaterialsList", "buildInfrastructureNeeds", "materialCostEstimate", "laborCostEstimate", "budgetPlanned", "ongoingSupportMonthlyCost", "contingencyPercent"],
  architecture: ["architectureProsCons", "highLevelArchitecture", "recommendedTechnology", "buildInfrastructureNeeds"],
};

type Msg = { role: "user" | "assistant"; content: string };

// Multi-turn helper for the idea stage. It answers questions and, when useful, proposes field
// changes -- which the client shows as a one-click "Apply" card. Nothing is saved here.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId = body?.projectId as string | undefined;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = typeof body.scope === "string" && body.scope in SCOPE_FIELDS ? body.scope : "hub";
  const allowed = SCOPE_FIELDS[scope];
  const messages: Msg[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: Msg) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m: Msg) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "A user message is required" }, { status: 400 });
  }

  const anthropic = getAnthropic();
  if (!anthropic) return NextResponse.json({ error: "AI is not configured (missing ANTHROPIC_API_KEY)." }, { status: 503 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project as Record<string, unknown> & typeof detail.project;
  const cost = computeIdeaCost({ items: detail.costItems, ...detail.project });
  const ready = ideaReadiness({ ...detail.project, cost, researched: !!p.ideaResearch });

  const fieldKeys = Object.keys(IDEA_CHAT_FIELDS).filter((k) => !allowed || allowed.includes(k));
  const current = fieldKeys.map((k) => `${k} (${IDEA_CHAT_FIELDS[k].label}): ${p[k] == null || p[k] === "" ? "(empty)" : String(p[k]).slice(0, 500)}`).join("\n");
  const research = p.ideaResearch as { summary?: string } | null;

  const system = `You are an experienced product strategist helping someone develop an early-stage idea into a decision-ready case.
Be concrete, brief and friendly. Use ONLY the facts below plus general knowledge; never invent figures, vendors or quotes -- ask or say "unknown".
Idea: ${detail.project.name}
Readiness: ${ready.doneCount}/${ready.total} (missing: ${ready.items.filter((i) => !i.done).map((i) => i.label).join(", ") || "none"})
Cost so far: one-time $${Math.round(cost.oneTimeTotal)}, ongoing $${Math.round(cost.ongoingAnnual)}/yr
Market research summary: ${research?.summary ?? "(not run yet)"}
Current field values:
${current}

Reply with ONLY JSON: {"reply": "your answer, 1-4 short paragraphs, plain text", "changes": {fieldKey: newValue, ...}}.
Include "changes" ONLY when the user asked you to draft/improve/fill something, using only these field keys: ${fieldKeys.join(", ")}.
Numbers must be plain numbers (dollars; ongoing support is per month). Otherwise use "changes": {}.`;

  try {
    const msg = await anthropic.messages.create({ model: AI_MODEL, max_tokens: 1800, system, messages, temperature: 0.4 });
    const block = msg.content[0];
    const raw = block && block.type === "text" ? block.text : "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]) as { reply?: unknown; changes?: unknown };
        const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Here's what I'd suggest.";
        return NextResponse.json({ reply, changes: sanitizeChatChanges(parsed.changes, allowed) });
      } catch { /* fall through to plain text */ }
    }
    return NextResponse.json({ reply: raw.trim() || "I couldn't come up with an answer — try rephrasing.", changes: {} });
  } catch (err) {
    return NextResponse.json({ error: `AI request failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
}
