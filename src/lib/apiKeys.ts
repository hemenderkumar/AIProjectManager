import crypto from "crypto";
import { db } from "./db";
import { apiKeys, projects } from "./db/schema";
import { eq, isNull } from "drizzle-orm";
import type { SessionUser } from "./auth";
import { canAccessProject } from "./tenancy";

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

// exta_<32 random hex chars> -- prefixed so a leaked key is recognizable at a glance (same
// idea as Stripe's sk_live_/pk_test_ prefixes), and short enough to display safely as the
// "key you'll never see again" identifier in the UI (keyPrefix below).
function generateRawKey(): string {
  return `exta_${crypto.randomBytes(24).toString("hex")}`;
}

export async function listApiKeys(user: SessionUser) {
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      projectId: apiKeys.projectId,
      projectName: projects.name,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .leftJoin(projects, eq(apiKeys.projectId, projects.id))
    .where(user.organizationId ? eq(apiKeys.organizationId, user.organizationId) : isNull(apiKeys.organizationId));
  return rows;
}

// Returns the raw key exactly once -- only hashedKey is ever persisted, same principle as
// users.passwordHash. The caller's UI must show rawKey to the user immediately and never
// ask for it again. projectId, when supplied, must be a project the creating user can already
// access -- this is what actually enforces "this key can only ever touch one project," not
// just a label; canAccessProject is the same check requireProjectAccess uses everywhere else.
export async function createApiKey(user: SessionUser, name: string, scopes: string[] = ["read"], projectId?: string | null) {
  if (projectId) {
    const allowed = await canAccessProject(user, projectId);
    if (!allowed) throw new Error("You don't have access to that project.");
  }
  const rawKey = generateRawKey();
  const [created] = await db
    .insert(apiKeys)
    .values({
      organizationId: user.organizationId ?? null,
      name,
      hashedKey: hashKey(rawKey),
      keyPrefix: rawKey.slice(0, 13), // "exta_" + 8 hex chars
      scopes,
      projectId: projectId || null,
      createdBy: user.name,
    })
    .returning();
  return { ...created, rawKey };
}

export async function revokeApiKey(id: string) {
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
}

export type ApiKeyAuth = { keyId: string; name: string; organizationId: string | null; projectId: string | null; scopes: string[] };

// Authenticates a public API request. Returns the key's identity, its organization scope
// (null = internal Executa staff key), its optional single-project restriction, and its
// scopes -- or null if the key is missing, unknown, or revoked. Updates lastUsedAt on every
// successful call, best-effort.
export async function verifyApiKey(rawKey: string): Promise<ApiKeyAuth | null> {
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.hashedKey, hashKey(rawKey)));
  if (!key || key.revokedAt) return null;
  db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)).catch(() => {});
  return { keyId: key.id, name: key.name, organizationId: key.organizationId, projectId: key.projectId, scopes: key.scopes };
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

// The shared project-restriction check every project-scoped public route (incidents, tasks)
// applies on top of its existing org check. Pure/synchronous so it's trivial to unit-test
// independent of the DB: a key with no projectId restriction (the common case) is allowed
// anywhere its org check already permits; a key WITH a projectId restriction may only touch
// that exact project, and a caller can also omit the target project entirely and let it
// default to the key's own -- see resolveApiKeyProjectId below.
export function isApiKeyAllowedForProject(auth: Pick<ApiKeyAuth, "projectId">, targetProjectId: string | null): boolean {
  if (!auth.projectId) return true; // unrestricted key
  return auth.projectId === targetProjectId;
}

// When a project-restricted key doesn't get an explicit projectId from the caller, default to
// the key's own -- an integration that only ever creates tickets for one project shouldn't
// have to pass projectId on every single call.
export function resolveApiKeyProjectId(auth: Pick<ApiKeyAuth, "projectId">, requested: string | null): string | null {
  if (requested) return requested;
  return auth.projectId ?? null;
}
