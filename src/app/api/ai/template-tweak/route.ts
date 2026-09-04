import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getTemplate, type TemplateSnapshot } from "@/lib/templates";
import { askClaudeJSON } from "@/lib/ai";

const VALID_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

// Sanitizes whatever the model returns into a well-formed TemplateSnapshot -- the model's
// JSON usually matches, but this is user-visible data going straight into a real project, so
// coerce/guard rather than trust it blindly (missing fields fall back to the original
// template's values instead of null-ing out a whole section).
function sanitizeSnapshot(raw: unknown, fallback: TemplateSnapshot): TemplateSnapshot {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rc = (r.charter && typeof r.charter === "object" ? r.charter : {}) as Record<string, unknown>;
  const charter = {
    description: typeof rc.description === "string" ? rc.description : fallback.charter?.description ?? null,
    problemStatement: typeof rc.problemStatement === "string" ? rc.problemStatement : fallback.charter?.problemStatement ?? null,
    proposedSolution: typeof rc.proposedSolution === "string" ? rc.proposedSolution : fallback.charter?.proposedSolution ?? null,
    expectedBenefits: typeof rc.expectedBenefits === "string" ? rc.expectedBenefits : fallback.charter?.expectedBenefits ?? null,
    program: typeof rc.program === "string" ? rc.program : fallback.charter?.program ?? null,
  };

  const rawTasks = Array.isArray(r.taskSkeleton) ? r.taskSkeleton : fallback.taskSkeleton ?? [];
  const taskSkeleton = rawTasks
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      title: typeof t.title === "string" && t.title.trim() ? t.title.trim() : "Untitled task",
      phase: typeof t.phase === "string" ? t.phase : null,
      priority: typeof t.priority === "string" && VALID_PRIORITIES.has(t.priority) ? t.priority : "MEDIUM",
      estimateHours: typeof t.estimateHours === "number" ? t.estimateHours : null,
    }));

  return { charter, taskSkeleton };
}

export async function POST(req: NextRequest) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { templateId, instruction } = body;
  if (!templateId || !instruction || !String(instruction).trim()) {
    return NextResponse.json({ error: "templateId and instruction are required" }, { status: 400 });
  }

  const template = await getTemplate(user, templateId);
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  const original = template.snapshot as TemplateSnapshot;

  const system = `You customize a project template into a starting point for a new project, based on the
user's plain-language instruction. You are given the template's original charter fields and task
skeleton as JSON. Apply ONLY the changes implied by the instruction -- keep everything else from the
original as-is (don't rewrite wording that wasn't asked to change, don't invent scope, dates, costs,
or people not mentioned). If the instruction asks to add tasks, add them with a sensible phase/priority
consistent with the existing skeleton. If it asks to remove or reprioritize tasks, do that. If it asks
to adjust the charter description/problem/solution/benefits, edit only those fields.

Respond as JSON matching this exact shape:
{
  "charter": { "description": string|null, "problemStatement": string|null, "proposedSolution": string|null, "expectedBenefits": string|null, "program": string|null },
  "taskSkeleton": [ { "title": string, "phase": string|null, "priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "estimateHours": number|null } ]
}`;

  const user_ = `Original template "${template.name}":
${JSON.stringify(original, null, 2)}

Instruction: ${String(instruction).trim()}`;

  const { data, error } = await askClaudeJSON<TemplateSnapshot>(system, user_, 4096);
  if (error) return NextResponse.json({ error }, { status: 502 });

  const snapshot = sanitizeSnapshot(data, original);
  return NextResponse.json({ snapshot });
}
