import { describe, it, expect, vi } from "vitest";

// getSecret() throws if AUTH_SECRET is unset -- set it before the module under test is ever
// imported/executed, same requirement production has via the real environment.
process.env.AUTH_SECRET = "test-only-secret-not-used-anywhere-real-12345";

vi.mock("@/lib/db", async () => {
  const { createMockDb } = await import("./mockDb");
  const instance = createMockDb();
  (globalThis as Record<string, unknown>).__testMockDb = instance;
  return { db: instance.db };
});

function queueResult(rows: Record<string, unknown>[]) {
  (globalThis as { __testMockDb?: { queueResult: (rows: Record<string, unknown>[]) => void } }).__testMockDb!.queueResult(rows);
}

import {
  roleAtLeast,
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  isDownloadBlocked,
  type SessionUser,
} from "@/lib/auth";

// roleAtLeast is the single gate every requireRole() call in the app depends on -- a bug here
// silently changes who can do what across every protected route, so its ordering deserves
// its own explicit test rather than only being exercised incidentally through route tests.
describe("roleAtLeast", () => {
  it("orders VIEWER < CONTRIBUTOR < PM < SUPER_USER < ADMIN", () => {
    const order: SessionUser["role"][] = ["VIEWER", "CONTRIBUTOR", "PM", "SUPER_USER", "ADMIN"];
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        expect(roleAtLeast(order[i], order[j])).toBe(i >= j);
      }
    }
  });

  it("a role always satisfies its own minimum", () => {
    for (const role of ["VIEWER", "CONTRIBUTOR", "PM", "SUPER_USER", "ADMIN"] as const) {
      expect(roleAtLeast(role, role)).toBe(true);
    }
  });
});

describe("password hashing", () => {
  it("round-trips: a hash verifies against its own plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });
});

describe("session tokens", () => {
  const user: SessionUser = {
    id: "user_1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "PM",
    organizationId: null,
  };

  it("round-trips a signed session token back to the same user", async () => {
    const token = await createSessionToken(user);
    const decoded = await verifySessionToken(token);
    expect(decoded).toMatchObject(user);
  });

  it("rejects a tampered/garbage token instead of throwing", async () => {
    const decoded = await verifySessionToken("not.a.valid.jwt");
    expect(decoded).toBeNull();
  });
});

// isDownloadBlocked is the single gate every export route (Word/PDF/PPTX, single or batch)
// calls before releasing a file -- see the comment on it in auth.ts. A regression here would
// either leak documents to unverified accounts or block everyone.
describe("isDownloadBlocked", () => {
  it("blocks an account with no verifiedAt", async () => {
    queueResult([{ verifiedAt: null }]);
    await expect(isDownloadBlocked("user_unverified")).resolves.toBe(true);
  });

  it("allows an account with a verifiedAt timestamp", async () => {
    queueResult([{ verifiedAt: new Date() }]);
    await expect(isDownloadBlocked("user_verified")).resolves.toBe(false);
  });

  it("blocks if the user row can't be found at all", async () => {
    queueResult([]);
    await expect(isDownloadBlocked("user_missing")).resolves.toBe(true);
  });
});
