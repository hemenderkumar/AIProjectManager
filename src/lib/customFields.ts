import { db } from "./db";
import { customFieldDefinitions, customFieldValues, workflowStages } from "./db/schema";
import { and, eq, isNull, or, inArray } from "drizzle-orm";
import type { SessionUser } from "./auth";

type Entity = "PROJECT" | "TASK" | "RISK" | "DELIVERABLE";

// Org-wide definitions (projectId null) plus this specific project's own additions —
// additive, never a replacement of the org default set. See the column comment on
// customFieldDefinitions.projectId in schema.ts.
export async function listFieldDefinitions(user: SessionUser, entity: Entity, projectId?: string | null) {
  const orgFilter = user.organizationId ? eq(customFieldDefinitions.organizationId, user.organizationId) : isNull(customFieldDefinitions.organizationId);
  const scopeFilter = projectId
    ? or(isNull(customFieldDefinitions.projectId), eq(customFieldDefinitions.projectId, projectId))
    : isNull(customFieldDefinitions.projectId);
  return db
    .select()
    .from(customFieldDefinitions)
    .where(and(orgFilter, eq(customFieldDefinitions.entity, entity), scopeFilter))
    .orderBy(customFieldDefinitions.sortOrder);
}

export async function createFieldDefinition(
  user: SessionUser,
  data: { entity: Entity; fieldKey: string; label: string; type?: string; options?: string[]; required?: boolean; projectId?: string | null }
) {
  const [created] = await db
    .insert(customFieldDefinitions)
    .values({
      organizationId: user.organizationId ?? null,
      projectId: data.projectId ?? null,
      entity: data.entity,
      fieldKey: data.fieldKey,
      label: data.label,
      type: (["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTISELECT"].includes(data.type ?? "") ? data.type : "TEXT") as
        | "TEXT"
        | "NUMBER"
        | "DATE"
        | "BOOLEAN"
        | "SELECT"
        | "MULTISELECT",
      options: data.options ?? null,
      required: data.required ?? false,
    })
    .returning();
  return created;
}

export async function deleteFieldDefinition(id: string) {
  await db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, id));
}

// One round trip for every field on an entity, keyed by fieldDefinitionId — the form
// component fills each input from this map rather than firing a request per field.
export async function getValuesForEntity(entityId: string): Promise<Record<string, string>> {
  const rows = await db.select().from(customFieldValues).where(eq(customFieldValues.entityId, entityId));
  return Object.fromEntries(rows.map((r) => [r.fieldDefinitionId, r.value ?? ""]));
}

export async function getValuesForEntities(entityIds: string[]): Promise<Map<string, Record<string, string>>> {
  if (!entityIds.length) return new Map();
  const rows = await db.select().from(customFieldValues).where(inArray(customFieldValues.entityId, entityIds));
  const map = new Map<string, Record<string, string>>();
  for (const r of rows) {
    const existing = map.get(r.entityId) ?? {};
    existing[r.fieldDefinitionId] = r.value ?? "";
    map.set(r.entityId, existing);
  }
  return map;
}

export async function setFieldValue(fieldDefinitionId: string, entityId: string, value: string) {
  const [existing] = await db
    .select()
    .from(customFieldValues)
    .where(and(eq(customFieldValues.fieldDefinitionId, fieldDefinitionId), eq(customFieldValues.entityId, entityId)));
  if (existing) {
    await db.update(customFieldValues).set({ value, updatedAt: new Date() }).where(eq(customFieldValues.id, existing.id));
  } else {
    await db.insert(customFieldValues).values({ fieldDefinitionId, entityId, value });
  }
}

// --- Workflow stages ---

export async function listWorkflowStages(projectId: string) {
  return db.select().from(workflowStages).where(eq(workflowStages.projectId, projectId)).orderBy(workflowStages.sortOrder);
}

export async function createWorkflowStage(projectId: string, name: string, color?: string) {
  const existing = await listWorkflowStages(projectId);
  const [created] = await db
    .insert(workflowStages)
    .values({ projectId, name, color: color ?? "#64748b", sortOrder: existing.length })
    .returning();
  return created;
}

export async function deleteWorkflowStage(id: string) {
  await db.delete(workflowStages).where(eq(workflowStages.id, id));
}
