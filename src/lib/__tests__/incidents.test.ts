import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createMockDb } = await import("./mockDb");
  const instance = createMockDb();
  (globalThis as Record<string, unknown>).__testMockDb = instance;
  return { db: instance.db };
});

function queueResult(rows: Record<string, unknown>[]) {
  (globalThis as { __testMockDb?: { queueResult: (rows: Record<string, unknown>[]) => void } }).__testMockDb!.queueResult(rows);
}

import { isValidAssigneeForOrg } from "@/lib/incidents";

// isValidAssigneeForOrg is what /api/public/v1/incidents (POST and PATCH) relies on before
// letting a calling application assign an incident to a real Executa user -- a bug here would
// let an org-scoped key assign a ticket to someone outside that organization.
describe("isValidAssigneeForOrg", () => {
  it("rejects an unknown user id", async () => {
    queueResult([]);
    expect(await isValidAssigneeForOrg("user_ghost", "org_1")).toBe(false);
  });

  it("allows a user in the same organization as an org-scoped key", async () => {
    queueResult([{ organizationId: "org_1" }]);
    expect(await isValidAssigneeForOrg("user_1", "org_1")).toBe(true);
  });

  it("rejects a user in a different organization from an org-scoped key", async () => {
    queueResult([{ organizationId: "org_2" }]);
    expect(await isValidAssigneeForOrg("user_1", "org_1")).toBe(false);
  });

  it("allows any existing user for an unrestricted (internal) key", async () => {
    queueResult([{ organizationId: "org_2" }]);
    expect(await isValidAssigneeForOrg("user_1", null)).toBe(true);
  });

  it("still rejects an unknown user id even for an unrestricted key", async () => {
    queueResult([]);
    expect(await isValidAssigneeForOrg("user_ghost", null)).toBe(false);
  });
});
