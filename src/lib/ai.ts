import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

export async function askClaude(system: string, user: string, maxTokens: number = 1500): Promise<string> {
  const anthropic = getAnthropic();
  if (!anthropic) {
    return (
      "AI features are not configured yet. Add an ANTHROPIC_API_KEY environment " +
      "variable (Vercel Project Settings -> Environment Variables) to enable AI-generated " +
      "charters, status reports, and the portfolio assistant."
    );
  }
  const msg = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = msg.content[0];
  return block && block.type === "text" ? block.text : "";
}

export type AskClaudeJSONResult<T> = { data: T | null; error?: string };

// maxTokens defaults generously high (8192) because structured JSON plans (milestones,
// 10-20 tasks with descriptions, team roster, cost breakdowns) can easily exceed the
// smaller limit used for plain-text AI replies, causing the JSON to get cut off mid-output.
export async function askClaudeJSON<T = unknown>(
  system: string,
  user: string,
  maxTokens: number = 8192
): Promise<AskClaudeJSONResult<T>> {
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
      user,
      maxTokens
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
      error:
        `The AI's plan was too large or got cut off before finishing (${cleaned.length} characters received). ` +
        `Try a shorter, more focused goal description, or click Generate plan again. ` +
        `Start of response: ${cleaned.slice(0, 200)}`,
    };
  }
}
