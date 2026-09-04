import { NextRequest, NextResponse } from "next/server";
import { askClaude, askClaudeJSON } from "@/lib/ai";
import { getPortfolioSummary, formatPortfolioForAI } from "@/lib/portfolio";
import { requireRole } from "@/lib/auth";
import { getCapabilitiesContext, canManageIntegrations } from "@/lib/aiCapabilities";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhooks";

type WebhookAction = { type: "create_webhook"; url: string | null; events: WebhookEvent[] };
type ApiKeyAction = { type: "create_api_key"; name: string; scopes: ("read" | "write")[] };
type AskResponse = { answer: string; action: WebhookAction | ApiKeyAction | null };

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { question } = await req.json();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const summary = await getPortfolioSummary(_authUser);
  const context = formatPortfolioForAI(summary);
  const canIntegrate = canManageIntegrations(_authUser);

  // The action-proposal path only applies to a narrow slice of questions (setting up a webhook
  // or API key) and only for a user whose role could actually create one -- everything else
  // gets the plain-text path unchanged, which is both cheaper and simpler to trust.
  if (canIntegrate) {
    const system = `You are Executa's AI PM, a portfolio-wide assistant. You have access to live portfolio
data and a description of every feature Executa has, both below. Answer the user's question directly,
referencing specific projects, KPIs, risks, or status where relevant. Be concise and actionable, and speak
like an experienced PMO lead. If asked to prioritize or recommend actions, be decisive.

${getCapabilitiesContext(_authUser)}

${context}

If — and only if — the user is asking you to set up, create, or configure a webhook or a public API key,
also propose one as structured data alongside your answer, so they can review and confirm it with one
click instead of typing it into the form themselves. Valid webhook events: ${WEBHOOK_EVENTS.join(", ")}.
Valid API key scopes: "read", "write".

Respond as JSON: { "answer": your normal conversational reply (1-4 sentences), "action": null, OR if
proposing a webhook: { "type": "create_webhook", "url": the destination URL if they gave one (a
Zapier/Make catch-hook link, Slack incoming webhook, or any HTTPS endpoint), else null, "events": an
array of event names from the valid list above that match what they described }, OR if proposing an API
key: { "type": "create_api_key", "name": a short descriptive name (e.g. "Jira integration"), "scopes":
an array containing "read" and/or "write" depending on what they described needing }. Never propose an
action unless they clearly asked to set one up — plain questions about how integrations work just get
"action": null. }`;

    const { data, error } = await askClaudeJSON<AskResponse>(system, question, 1200);
    if (data) {
      // Defense in depth: even though the prompt already conditions action-proposal on
      // canIntegrate, never trust the model as the actual permission check.
      let action: AskResponse["action"] = null;
      if (canIntegrate && data.action?.type === "create_webhook") {
        const events = Array.isArray(data.action.events)
          ? data.action.events.filter((e): e is WebhookEvent => (WEBHOOK_EVENTS as string[]).includes(e))
          : [];
        action = { type: "create_webhook", url: typeof data.action.url === "string" ? data.action.url : null, events };
      } else if (canIntegrate && data.action?.type === "create_api_key") {
        const scopes = Array.isArray(data.action.scopes) ? data.action.scopes.filter((s) => s === "read" || s === "write") : [];
        action = { type: "create_api_key", name: typeof data.action.name === "string" ? data.action.name : "", scopes: scopes.length ? scopes : ["read"] };
      }
      return NextResponse.json({ answer: data.answer || "Here's what I found.", action });
    }
    // Fall through to the plain-text path below if the structured call failed for any reason
    // (e.g. the model didn't return valid JSON) -- a portfolio question should never come back
    // empty just because the action-proposal machinery hiccuped.
    if (error) {
      return NextResponse.json({ error }, { status: 502 });
    }
  }

  const system = `You are an AI project management assistant embedded in a KPI-driven project tracker.
You have access to live portfolio data and a description of every feature Executa has, both below.
Answer the user's question directly, referencing specific projects, KPIs, risks, or status where
relevant. Be concise and actionable, and speak like an experienced PMO lead. If asked to prioritize or
recommend actions, be decisive.

${getCapabilitiesContext(_authUser)}

${context}`;

  const answer = await askClaude(system, question);
  return NextResponse.json({ answer, action: null });
}
