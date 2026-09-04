import { db } from "./db";
import { contentTemplates } from "./db/schema";
import { eq, or, isNull, and } from "drizzle-orm";
import type { SessionUser } from "./auth";

export type ContentTemplateEntity = "RFP" | "SOW" | "STATUS_REPORT";
export type ContentTemplateKind = "SKELETON" | "STYLE_PRESET";

// SKELETON snapshot shapes — a point-in-time copy of the entity's own reusable
// pointer/summary fields, applied client-side by pre-filling the "new RFP"/"new SOW" form
// (see VendorEvaluationPageClient.tsx / SowTab.tsx) rather than by any server-side merge.
export type RfpSkeletonSnapshot = {
  background: string | null;
  scope: string | null;
  requirements: string | null;
  timeline: string | null;
  budgetRange: string | null;
  criteria: Array<{ name: string; weightPercent: number }>;
};
export type SowSkeletonSnapshot = {
  executiveSummary: string | null;
  scope: string | null;
  deliverablesSummary: string | null;
  timeline: string | null;
  fundingTerms: string | null;
  risks: string | null;
  issues: string | null;
};
// STYLE_PRESET snapshot — a named, reusable instruction appended to the existing hardcoded
// AI system prompt for that entity's draft/generate flow. Same shape for all three entity
// types; never touches the entity's own persisted fields.
export type StylePresetSnapshot = { systemPromptAddendum: string };

export type ContentTemplateSnapshot = RfpSkeletonSnapshot | SowSkeletonSnapshot | StylePresetSnapshot;

export async function listContentTemplates(user: SessionUser, entityType: ContentTemplateEntity, kind?: ContentTemplateKind) {
  const visibility = user.organizationId
    ? or(eq(contentTemplates.organizationId, user.organizationId), isNull(contentTemplates.organizationId))
    : isNull(contentTemplates.organizationId);
  const conditions = [eq(contentTemplates.entityType, entityType), visibility];
  if (kind) conditions.push(eq(contentTemplates.kind, kind));
  return db
    .select()
    .from(contentTemplates)
    .where(and(...conditions));
}

// Org-scoped single lookup — used by the draft/generate endpoints so a style preset (or
// skeleton) id can't be pointed at another organization's private template.
export async function getContentTemplate(user: SessionUser, id: string) {
  const visibility = user.organizationId
    ? or(eq(contentTemplates.organizationId, user.organizationId), isNull(contentTemplates.organizationId))
    : isNull(contentTemplates.organizationId);
  const [row] = await db
    .select()
    .from(contentTemplates)
    .where(and(eq(contentTemplates.id, id), visibility));
  return row ?? null;
}

export async function createContentTemplate(
  user: SessionUser,
  entityType: ContentTemplateEntity,
  kind: ContentTemplateKind,
  name: string,
  description: string | undefined,
  snapshot: ContentTemplateSnapshot
) {
  const [created] = await db
    .insert(contentTemplates)
    .values({
      organizationId: user.organizationId ?? null,
      entityType,
      kind,
      name,
      description: description ?? null,
      snapshot,
      createdBy: user.name,
    })
    .returning();
  return created;
}

export async function deleteContentTemplate(user: SessionUser, id: string) {
  const existing = await getContentTemplate(user, id);
  if (!existing) return false;
  await db.delete(contentTemplates).where(eq(contentTemplates.id, id));
  return true;
}

// Looks up a STYLE_PRESET by id (scoped to the caller) and returns its instruction text, or
// null if the id is missing/not found/not actually a style preset — callers treat this as
// "no preset selected" rather than an error, since drafting should still work without one.
export async function getStylePresetAddendum(user: SessionUser, templateId: string | null | undefined): Promise<string | null> {
  if (!templateId) return null;
  const row = await getContentTemplate(user, templateId);
  if (!row || row.kind !== "STYLE_PRESET") return null;
  const snapshot = row.snapshot as StylePresetSnapshot;
  return snapshot?.systemPromptAddendum?.trim() || null;
}
