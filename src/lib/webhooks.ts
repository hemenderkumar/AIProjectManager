import crypto from "crypto";
import { db } from "./db";
import { webhooks } from "./db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import type { SessionUser } from "./auth";

export type WebhookEvent =
  | "TASK_STATUS_CHANGED"
  | "PROJECT_STAGE_CHANGED"
  | "DELIVERABLE_APPROVED"
  | "RISK_CREATED"
  | "INCIDENT_CREATED"
  | "INCIDENT_STATUS_CHANGED"
  | "INCIDENT_ESCALATED"
  | "DEMAND_REQUEST_CREATED"
  | "DEMAND_REQUEST_STATUS_CHANGED"
  | "IDEA_CREATED"
  | "IDEA_STAGE_CHANGED";

// Runtime list mirroring the union above -- server-only code (e.g. the AI PM's webhook-action
// validator) needs an actual array to check membership against, not just a compile-time type.
export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "TASK_STATUS_CHANGED",
  "PROJECT_STAGE_CHANGED",
  "DELIVERABLE_APPROVED",
  "RISK_CREATED",
  "INCIDENT_CREATED",
  "INCIDENT_STATUS_CHANGED",
  "INCIDENT_ESCALATED",
  "DEMAND_REQUEST_CREATED",
  "DEMAND_REQUEST_STATUS_CHANGED",
  "IDEA_CREATED",
  "IDEA_STAGE_CHANGED",
];

export async function listWebhooks(user: SessionUser) {
  return db.select().from(webhooks).where(user.organizationId ? eq(webhooks.organizationId, user.organizationId) : isNull(webhooks.organizationId));
}

export async function createWebhook(user: SessionUser, url: string, events: WebhookEvent[]) {
  const secret = crypto.randomBytes(24).toString("hex");
  const [created] = await db
    .insert(webhooks)
    .values({ organizationId: user.organizationId ?? null, url, secret, events, createdBy: user.name })
    .returning();
  return created;
}

export async function deleteWebhook(id: string) {
  await db.delete(webhooks).where(eq(webhooks.id, id));
}

type WebhookRow = typeof webhooks.$inferSelect;

// The one query shared by both dispatchWebhook and dispatchWebhooks below — active
// subscriptions for the org (or the shared/internal org-null subscriptions). Pulled out so a
// caller firing more than one event off the same mutation (e.g. a gate transition that changes
// both `stage` and `ideationSubStage`) can look this up once instead of once per event.
async function fetchActiveWebhooks(organizationId: string | null): Promise<WebhookRow[]> {
  const orgFilter = organizationId ? or(eq(webhooks.organizationId, organizationId), isNull(webhooks.organizationId)) : isNull(webhooks.organizationId);
  return db.select().from(webhooks).where(and(orgFilter, eq(webhooks.isActive, true)));
}

// Delivers one event to whichever of the given hooks are subscribed to it — signed with
// HMAC-SHA256 in X-Executa-Signature, same pattern Stripe/GitHub deliveries use, so a receiver
// can verify the payload came from Executa and wasn't tampered with in transit. Best-effort: a
// slow or failing endpoint never blocks the mutation that triggered it, and every attempt
// (success or failure) records its own status.
async function deliverEvent(hooks: WebhookRow[], event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  const matching = hooks.filter((w) => (w.events as string[]).includes(event));
  if (!matching.length) return;

  const body = JSON.stringify({ event, data: payload, deliveredAt: new Date().toISOString() });

  await Promise.all(
    matching.map(async (hook) => {
      const signature = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
      let status = 0;
      try {
        const res = await fetch(hook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Executa-Signature": signature, "X-Executa-Event": event },
          body,
          signal: AbortSignal.timeout(8000),
        });
        status = res.status;
      } catch {
        status = 0;
      }
      await db.update(webhooks).set({ lastDeliveryAt: new Date(), lastDeliveryStatus: status }).where(eq(webhooks.id, hook.id));
    })
  );
}

// Single-event dispatch — the common case, used by every mutation that only ever fires one
// event.
export async function dispatchWebhook(organizationId: string | null, event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  try {
    const hooks = await fetchActiveWebhooks(organizationId);
    await deliverEvent(hooks, event, payload);
  } catch (err) {
    console.error("webhook dispatch failed:", err);
  }
}

// Batched dispatch for the handful of call sites where one mutation can trigger more than one
// event for the same org (e.g. a gate transition that moves both `stage` and
// `ideationSubStage`) — looks up active hooks once and fans each event out from there, instead
// of repeating the same subscription query per event.
export async function dispatchWebhooks(organizationId: string | null, events: { event: WebhookEvent; payload: Record<string, unknown> }[]): Promise<void> {
  if (!events.length) return;
  try {
    const hooks = await fetchActiveWebhooks(organizationId);
    await Promise.all(events.map(({ event, payload }) => deliverEvent(hooks, event, payload)));
  } catch (err) {
    console.error("webhook dispatch failed:", err);
  }
}
