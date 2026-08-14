import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { requireRole } from "@/lib/auth";

type RuleDraft = {
  name: string;
  trigger: "TASK_STATUS_CHANGED" | "TASK_ASSIGNED" | "TASK_OVERDUE" | "RISK_CREATED" | "DELIVERABLE_APPROVED";
  conditions: Record<string, unknown>;
  actions: Array<{ type: "NOTIFY" | "SLACK" | "SET_STATUS"; target?: string; message?: string; value?: string }>;
};

// Turns a plain-English rule description into the structured shape automationRules needs —
// same "rough note -> structured record" pattern as draft-risk, so building a rule doesn't
// require learning the trigger/condition/action vocabulary up front.
export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    return NextResponse.json({ error: "Describe the rule first, then draft with AI." }, { status: 400 });
  }

  const system = `You are helping someone define an automation rule for a project-management tool from a plain-English
instruction. Available triggers: TASK_STATUS_CHANGED (payload has fromStatus/toStatus), TASK_ASSIGNED,
TASK_OVERDUE (payload has daysOverdue), RISK_CREATED, DELIVERABLE_APPROVED. Available actions:
NOTIFY (target: "ASSIGNEE", optional message), SLACK (optional message posted to the project's Slack
channel), SET_STATUS (value: one of TODO/IN_PROGRESS/BLOCKED/DONE -- only sensible for a
TASK_OVERDUE or TASK_ASSIGNED trigger, never TASK_STATUS_CHANGED, to avoid an obvious loop).

Instruction from the user:
"""
${instruction}
"""

Respond as JSON: { "name": a short human-readable rule name, "trigger": one of the triggers above,
"conditions": an object of exact-match conditions against the event payload (e.g. {"toStatus":"BLOCKED"}
for a TASK_STATUS_CHANGED rule about tasks becoming blocked) -- empty object {} if the rule should fire on
every occurrence of the trigger, "actions": an array of 1-2 action objects as described above }`;

  const { data, error } = await askClaudeJSON<RuleDraft>(system, "Draft this automation rule now.", 800);
  if (error || !data) {
    return NextResponse.json({ error: error ?? "Couldn't draft a rule from that." }, { status: 502 });
  }
  return NextResponse.json(data);
}
