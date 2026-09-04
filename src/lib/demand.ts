import { db } from "./db";
import { demandRequests, projects, projectMembers } from "./db/schema";
import { eq, or, isNull } from "drizzle-orm";
import type { SessionUser } from "./auth";
import { dispatchWebhook } from "./webhooks";

type DemandType = "STRATEGIC" | "RUN_THE_BUSINESS" | "COMPLIANCE" | "ENHANCEMENT";

// Public — no login required, same "anyone can submit, nothing happens until reviewed"
// principle as registrationRequests.
export async function submitDemand(data: { title: string; description: string; expectedOutcome?: string | null; requestedByName: string; requestedByEmail: string; organizationId?: string | null; type?: DemandType }) {
  const [created] = await db
    .insert(demandRequests)
    .values({
      title: data.title,
      description: data.description,
      expectedOutcome: data.expectedOutcome ?? null,
      requestedByName: data.requestedByName,
      requestedByEmail: data.requestedByEmail,
      organizationId: data.organizationId ?? null,
      type: data.type,
    })
    .returning();

  await dispatchWebhook(created.organizationId, "DEMAND_REQUEST_CREATED", {
    id: created.id, title: created.title, type: created.type, requestedByName: created.requestedByName,
  });

  return created;
}

// ADMIN sees every request. SUPER_USER sees their own org's requests plus internal
// (organizationId null) ones -- mirrors the "internal-only project" visibility convention.
// PM/CONTRIBUTOR/VIEWER don't triage demand today (that's a SUPER_USER+/ADMIN activity, same
// tier as the org-wide custom-field/automation-rule config), so they get an empty list rather
// than a 403 -- the /demand nav link stays visible for everyone (it's a legitimate front door
// to submit from), but only privileged roles see the backlog.
export async function listDemand(user: SessionUser) {
  if (user.role === "ADMIN") return db.select().from(demandRequests);
  if (user.role === "SUPER_USER" && user.organizationId) {
    return db.select().from(demandRequests).where(or(eq(demandRequests.organizationId, user.organizationId), isNull(demandRequests.organizationId)));
  }
  return [];
}

export async function triageDemand(id: string, notes: string, isDuplicateOfId?: string | null) {
  const [updated] = await db
    .update(demandRequests)
    .set({ status: "TRIAGED", triageNotes: notes, isDuplicateOfId: isDuplicateOfId ?? null, updatedAt: new Date() })
    .where(eq(demandRequests.id, id))
    .returning();
  if (updated) {
    await dispatchWebhook(updated.organizationId, "DEMAND_REQUEST_STATUS_CHANGED", {
      id: updated.id, title: updated.title, status: updated.status,
    });
  }
  return updated;
}

// Coarse priority score for ranking the backlog: (value + urgency) weighted down by effort
// size. Not meant to be precise -- see the schema comment on priorityScore -- just enough to
// sort a list.
const EFFORT_WEIGHT: Record<string, number> = { S: 1, M: 2, L: 3, XL: 4 };

export async function scoreDemand(id: string, businessValueScore: number, urgencyScore: number, effortTshirtSize: string) {
  const effortWeight = EFFORT_WEIGHT[effortTshirtSize] ?? 2;
  const priorityScore = (businessValueScore + urgencyScore) / effortWeight;
  const [updated] = await db
    .update(demandRequests)
    .set({ status: "SCORED", businessValueScore, urgencyScore, effortTshirtSize, priorityScore, updatedAt: new Date() })
    .where(eq(demandRequests.id, id))
    .returning();
  if (updated) {
    await dispatchWebhook(updated.organizationId, "DEMAND_REQUEST_STATUS_CHANGED", {
      id: updated.id, title: updated.title, status: updated.status, priorityScore: updated.priorityScore,
    });
  }
  return updated;
}

export async function decideDemand(user: SessionUser, id: string, decision: "APPROVED" | "DEFERRED" | "REJECTED", reason: string, capacityNotes?: string) {
  const [updated] = await db
    .update(demandRequests)
    .set({ status: decision, decisionReason: reason, capacityNotes: capacityNotes ?? null, decidedBy: user.name, decidedAt: new Date(), updatedAt: new Date() })
    .where(eq(demandRequests.id, id))
    .returning();
  if (updated) {
    await dispatchWebhook(updated.organizationId, "DEMAND_REQUEST_STATUS_CHANGED", {
      id: updated.id, title: updated.title, status: updated.status, decisionReason: updated.decisionReason,
    });
  }
  return updated;
}

// Promotes an APPROVED request into a real project, which then enters the existing Ideation
// gates unchanged -- this table's job ends here. See the schema comment on
// demandRequests.convertedProjectId.
export async function convertDemand(user: SessionUser, id: string) {
  const [demand] = await db.select().from(demandRequests).where(eq(demandRequests.id, id));
  if (!demand || demand.status !== "APPROVED") return null;

  const [created] = await db
    .insert(projects)
    .values({
      name: demand.title,
      organizationId: demand.organizationId,
      description: demand.expectedOutcome ? `${demand.description}\n\nExpected outcome: ${demand.expectedOutcome}` : demand.description,
      problemStatement: demand.description,
      stage: "INCEPTION",
      priority: (demand.urgencyScore ?? 0) >= 4 ? "HIGH" : "MEDIUM",
      ideaType: "OPPORTUNITY",
    })
    .returning();

  await db.insert(projectMembers).values({ projectId: created.id, userId: user.id });

  await db
    .update(demandRequests)
    .set({ status: "CONVERTED", convertedProjectId: created.id, convertedAt: new Date(), updatedAt: new Date() })
    .where(eq(demandRequests.id, id));

  await dispatchWebhook(demand.organizationId, "DEMAND_REQUEST_STATUS_CHANGED", {
    id: demand.id, title: demand.title, status: "CONVERTED", convertedProjectId: created.id,
  });

  return created;
}
