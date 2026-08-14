import crypto from "crypto";
import { db } from "./db";
import { webhooks } from "./db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import type { SessionUser } from "./auth";

type WebhookEvent = "TASK_STATUS_CHANGED" | "PROJECT_STAGE_CHANGED" | "DELIVERABLE_APPROVED" | "RISK_CREATED";

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

// Fires every active webhook subscribed to `event` for the given org (or the shared/internal
// org-null subscriptions) — signed with HMAC-SHA256 in X-Executa-Signature, same pattern
// Stripe/GitHub deliveries use, so a receiver can verify the payload came from Executa and
// wasn't tampered with in transit. Best-effort: a slow or failing endpoint never blocks the
// mutation that triggered it, and every attempt (success or failure) records its own status.
export async function dispatchWebhook(organizationId: string | null, event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  try {
    const orgFilter = organizationId ? or(eq(webhooks.organizationId, organizationId), isNull(webhooks.organizationId)) : isNull(webhooks.organizationId);
    const subs = await db.select().from(webhooks).where(and(orgFilter, eq(webhooks.isActive, true)));
    const matching = subs.filter((w) => (w.events as string[]).includes(event));

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
  } catch (err) {
    console.error("webhook dispatch failed:", err);
  }
}
