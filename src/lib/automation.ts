import { db } from "./db";
import { automationRules, tasks } from "./db/schema";
import { and, eq, or, isNull } from "drizzle-orm";
import { notify } from "./notifications";
import { notifySlackForProject } from "./slack";
import { sendEmail } from "./email";
import type { SessionUser } from "./auth";

type Trigger = "TASK_STATUS_CHANGED" | "TASK_ASSIGNED" | "TASK_OVERDUE" | "RISK_CREATED" | "DELIVERABLE_APPROVED";

type Action =
  | { type: "NOTIFY"; target: "ASSIGNEE" | "PROJECT_MEMBERS"; message?: string }
  | { type: "SLACK"; message?: string }
  | { type: "SET_STATUS"; value: string };

// Event payload shape varies by trigger -- callers pass whatever's relevant (see the
// TASK_STATUS_CHANGED call site in the task PATCH route for the canonical example).
export type AutomationEvent = {
  trigger: Trigger;
  projectId: string;
  taskId?: string;
  taskTitle?: string;
  assigneeUserId?: string | null;
  assigneeEmail?: string | null;
  fromStatus?: string;
  toStatus?: string;
  daysOverdue?: number;
};

export async function listRules(user: SessionUser, projectId?: string | null) {
  const orgFilter = user.organizationId ? eq(automationRules.organizationId, user.organizationId) : isNull(automationRules.organizationId);
  const scopeFilter = projectId ? or(isNull(automationRules.projectId), eq(automationRules.projectId, projectId)) : undefined;
  return db
    .select()
    .from(automationRules)
    .where(scopeFilter ? and(orgFilter, scopeFilter) : orgFilter);
}

export async function createRule(
  user: SessionUser,
  data: { name: string; trigger: Trigger; conditions?: Record<string, unknown>; actions: Action[]; projectId?: string | null }
) {
  const [created] = await db
    .insert(automationRules)
    .values({
      organizationId: user.organizationId ?? null,
      projectId: data.projectId ?? null,
      name: data.name,
      trigger: data.trigger,
      conditions: data.conditions ?? {},
      actions: data.actions,
      createdBy: user.name,
    })
    .returning();
  return created;
}

export async function deleteRule(id: string) {
  await db.delete(automationRules).where(eq(automationRules.id, id));
}

export async function toggleRule(id: string, isActive: boolean) {
  await db.update(automationRules).set({ isActive }).where(eq(automationRules.id, id));
}

// Matches a rule's jsonb `conditions` against the fired event: every key present in
// conditions must equal the same key on the event payload. An empty conditions object
// always matches (the rule fires on every occurrence of its trigger).
function matchesConditions(conditions: Record<string, unknown>, event: AutomationEvent): boolean {
  return Object.entries(conditions).every(([key, value]) => (event as unknown as Record<string, unknown>)[key] === value);
}

// The executor. Called once, synchronously, from the route that produced the event (task
// PATCH/POST, risk creation, deliverable approval) -- no queue infrastructure for v1, see
// the product-strategy discussion on why that's the right trade-off here. Actions never
// re-invoke this function, so there's no risk of a rule triggering itself into a loop even
// when a SET_STATUS action changes the very field a TASK_STATUS_CHANGED rule watches.
export async function runAutomationRules(event: AutomationEvent): Promise<void> {
  try {
    const rules = await db
      .select()
      .from(automationRules)
      .where(
        and(
          eq(automationRules.trigger, event.trigger),
          eq(automationRules.isActive, true),
          or(isNull(automationRules.projectId), eq(automationRules.projectId, event.projectId))
        )
      );

    for (const rule of rules) {
      const conditions = (rule.conditions as Record<string, unknown>) ?? {};
      if (!matchesConditions(conditions, event)) continue;

      const actions = (rule.actions as Action[]) ?? [];
      for (const action of actions) {
        await runAction(action, event);
      }

      await db
        .update(automationRules)
        .set({ lastRunAt: new Date(), runCount: (rule.runCount ?? 0) + 1 })
        .where(eq(automationRules.id, rule.id));
    }
  } catch (err) {
    // Automation is best-effort -- a bad rule must never break the task mutation that
    // triggered it, same "never throw past its own boundary" convention as notify().
    console.error("automation rule run failed:", err);
  }
}

async function runAction(action: Action, event: AutomationEvent): Promise<void> {
  if (action.type === "NOTIFY") {
    if (action.target !== "ASSIGNEE") return;
    const title = action.message ?? `Automation: ${event.taskTitle ?? "a task"} needs attention`;
    if (event.assigneeUserId) {
      // Has a real Executa login -- goes through the normal in-app + email notification path.
      await notify({
        userId: event.assigneeUserId,
        type: "AUTOMATION",
        title,
        body: event.toStatus ? `Status changed to ${event.toStatus}` : undefined,
        link: `/projects/${event.projectId}`,
        email: event.assigneeEmail,
      });
    } else if (event.assigneeEmail) {
      // Assignee is a resource with no linked user account -- email-only, no in-app bell to
      // deliver to.
      await sendEmail(event.assigneeEmail, title, event.toStatus ? `Status changed to ${event.toStatus}` : title).catch(() => false);
    }
    return;
  }
  if (action.type === "SLACK") {
    await notifySlackForProject(event.projectId, action.message ?? `🤖 Automation fired for *${event.taskTitle ?? "a task"}*`);
    return;
  }
  if (action.type === "SET_STATUS" && event.taskId) {
    const allowed = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];
    if (allowed.includes(action.value)) {
      await db
        .update(tasks)
        .set({ status: action.value as "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE", updatedAt: new Date() })
        .where(eq(tasks.id, event.taskId));
    }
  }
}
