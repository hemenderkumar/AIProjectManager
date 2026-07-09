import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

export async function askClaude(system: string, user: string): Promise<string> {
  const anthropic = getAnthropic();
  if (!anthropic) {
    return (
      "AI features are not configured yet. Add an ANTHROPIC_API_KEY environment " +
      "variable (Vercel Project Settings → Environment Variables) to enable AI-generated " +
      "charters, status reports, and the portfolio assistant."
    );
  }
  const msg = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = msg.content[0];
  return block && block.type === "text" ? block.text : "";
}

export type AskClaudeJSONResult<T> = { data: T | null; error?: string };

export async function askClaudeJSON<T = unknown>(system: string, user: string): Promise<AskClaudeJSONResult<T>> {
  if (!getAnthropic()) {
    return {
      data: null,
      error:
        "ANTHROPIC_API_KEY is missing from this deployment's environment variables. In Vercel: " +
        "Settings -> Environment Variables -> confirm ANTHROPIC_API_KEY exists AND the 'Production' " +
        "box is checked, then redeploy (env var changes only apply to new deployments, not existing ones).",
    };
  }

  let raw: string;
  try {
    raw = await askClaude(
      system + "\n\nRespond with ONLY valid JSON. No markdown code fences, no commentary, no explanation before or after.",
      user
    );
  } catch (err) {
    return {
      data: null,
      error: `The request to the AI model failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : cleaned;
  try {
    return { data: JSON.parse(jsonText) as T };
  } catch {
    return {
      data: null,
      error: `The AI responded but the output wasn't valid JSON. First 200 characters: ${cleaned.slice(0, 200)}`,
    };
  }
}
