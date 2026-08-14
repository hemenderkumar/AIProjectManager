import crypto from "crypto";
import { db } from "./db";
import { apiKeys } from "./db/schema";
import { eq, isNull } from "drizzle-orm";
import type { SessionUser } from "./auth";

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
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(user.organizationId ? eq(apiKeys.organizationId, user.organizationId) : isNull(apiKeys.organizationId));
}

// Returns the raw key exactly once -- only hashedKey is ever persisted, same principle as
// users.passwordHash. The caller's UI must show rawKey to the user immediately and never
// ask for it again.
export async function createApiKey(user: SessionUser, name: string, scopes: string[] = ["read"]) {
  const rawKey = generateRawKey();
  const [created] = await db
    .insert(apiKeys)
    .values({
      organizationId: user.organizationId ?? null,
      name,
      hashedKey: hashKey(rawKey),
      keyPrefix: rawKey.slice(0, 13), // "exta_" + 8 hex chars
      scopes,
      createdBy: user.name,
    })
    .returning();
  return { ...created, rawKey };
}

export async function revokeApiKey(id: string) {
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
}

// Authenticates a public API request. Returns the organizationId the key is scoped to
// (null = internal Executa staff key) plus its scopes, or null if the key is missing,
// unknown, or revoked. Updates lastUsedAt on every successful call, best-effort.
export async function verifyApiKey(rawKey: string): Promise<{ organizationId: string | null; scopes: string[] } | null> {
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.hashedKey, hashKey(rawKey)));
  if (!key || key.revokedAt) return null;
  db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)).catch(() => {});
  return { organizationId: key.organizationId, scopes: key.scopes };
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}
