import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { requireRole } from "@/lib/auth";

type DraftProjectFields = {
  name: string;
  description: string;
  sponsor: string;
  projectManager: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  stage: "INCEPTION" | "IDEATION" | "CHARTER" | "EXECUTION";
  country: string;
  program: string;
  problemStatement: string;
  proposedSolution: string;
  expectedBenefits: string;
  ideationNotes: string;
};

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { message } = await req.json();
  if (!message || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const system = `You are an assistant helping a project manager fill out a new project intake form
from a short, informal description they typed. Extract or sensibly infer values for every field below.
If the user didn't mention something, make a reasonable, conservative guess based on context rather than
leaving it blank — but keep guesses short and plausible (this is a draft the user will review and edit).

Fields:
- name: a short, clear project name (a few words)
- description: one or two sentence summary
- sponsor: a plausible sponsor/role if not stated (e.g. "VP of Operations"), else best guess from context
- projectManager: leave as empty string "" if not mentioned
- priority: one of LOW, MEDIUM, HIGH, CRITICAL
- stage: one of INCEPTION, IDEATION, CHARTER, EXECUTION (default to INCEPTION unless the message implies further along)
- country: empty string "" if not mentioned
- program: empty string "" if not mentioned
- problemStatement: 1-2 sentences on the problem being solved
- proposedSolution: 1-2 sentences on the proposed approach
- expectedBenefits: 1-2 sentences on expected benefits
- ideationNotes: any other relevant early notes, or empty string ""

Respond with ONLY a JSON object with exactly these keys: name, description, sponsor, projectManager,
priority, stage, country, program, problemStatement, proposedSolution, expectedBenefits, ideationNotes.
All values must be strings.`;

  const { data: result, error: draftError } = await askClaudeJSON<DraftProjectFields>(system, message);

  if (!result) {
    return NextResponse.json(
      { error: draftError ?? "Could not generate a draft from that description. Try adding a bit more detail." },
      { status: 422 }
    );
  }

  return NextResponse.json({ fields: result });
}
