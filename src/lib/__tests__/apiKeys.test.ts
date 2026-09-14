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

import { isApiKeyAllowedForProject, resolveApiKeyProjectId, createApiKey, updateApiKey } from "@/lib/apiKeys";
import type { SessionUser } from "@/lib/auth";

// isApiKeyAllowedForProject is the actual enforcement point every project-scoped public route
// (incidents, tasks) relies on -- a bug here means a project-restricted key could reach
// another project's data.
describe("isApiKeyAllowedForProject", () => {
  it("allows any project when the key is unrestricted", () => {
    expect(isApiKeyAllowedForProject({ projectId: null }, "proj_1")).toBe(true);
    expect(isApiKeyAllowedForProject({ projectId: null }, null)).toBe(true);
  });

  it("allows only the matching project when restricted", () => {
    expect(isApiKeyAllowedForProject({ projectId: "proj_1" }, "proj_1")).toBe(true);
  });

  it("rejects a different project when restricted", () => {
    expect(isApiKeyAllowedForProject({ projectId: "proj_1" }, "proj_2")).toBe(false);
  });

  it("rejects a null target when restricted", () => {
    expect(isApiKeyAllowedForProject({ projectId: "proj_1" }, null)).toBe(false);
  });
});

// resolveApiKeyProjectId lets a project-restricted key omit projectId on a request and have it
// default to the key's own project -- this is what makes a single-project integration not have
// to pass the same projectId on every call.
describe("resolveApiKeyProjectId", () => {
  it("uses the explicitly requested project when given", () => {
    expect(resolveApiKeyProjectId({ projectId: "proj_1" }, "proj_2")).toBe("proj_2");
  });

  it("falls back to the key's own project when nothing requested", () => {
    expect(resolveApiKeyProjectId({ projectId: "proj_1" }, null)).toBe("proj_1");
  });

  it("falls back to null when neither is set (unrestricted key, no request)", () => {
    expect(resolveApiKeyProjectId({ projectId: null }, null)).toBeNull();
  });
});

// createApiKey must refuse to scope a key to a project the creating user can't access --
// otherwise project-restriction would be a label, not a real boundary.
describe("createApiKey project access enforcement", () => {
  const user: SessionUser = {
    id: "user_1",
    name: "Test User",
    email: "test@example.com",
    role: "SUPER_USER",
    organizationId: "org_1",
  } as SessionUser;

  it("throws when the user cannot access the requested project", async () => {
    // canAccessProject (lib/tenancy.ts) queries the project row itself; return one belonging
    // to a different org so the access check fails.
    queueResult([{ id: "proj_1", organizationId: "org_2" }]);
    await expect(createApiKey(user, "Test Key", ["read"], "proj_1")).rejects.toThrow(
      "You don't have access to that project."
    );
  });
});

// updateApiKey is what lets an admin reconfigure a key -- scopes, project restriction, default
// assignee -- entirely from the UI, without deleting and regenerating it (which would break
// whatever secret the calling application already has). Ownership enforcement here is the same
// boundary DELETE relies on: an org can only ever touch its own keys.
describe("updateApiKey", () => {
  const superUser: SessionUser = {
    id: "user_1", name: "Test User", email: "test@example.com", role: "SUPER_USER", organizationId: "org_1",
  } as SessionUser;
  const admin: SessionUser = {
    id: "admin_1", name: "Admin", email: "admin@example.com", role: "ADMIN", organizationId: null,
  } as SessionUser;

  it("throws when the key doesn't exist", async () => {
    queueResult([]);
    await expect(updateApiKey(superUser, "key_missing", { scopes: ["read"] })).rejects.toThrow("API key not found.");
  });

  it("throws when a SUPER_USER tries to manage another organization's key", async () => {
    queueResult([{ id: "key_1", organizationId: "org_2" }]);
    await expect(updateApiKey(superUser, "key_1", { scopes: ["read"] })).rejects.toThrow(
      "You don't have access to that API key."
    );
  });

  it("lets an ADMIN manage any key regardless of organization", async () => {
    queueResult([{ id: "key_1", organizationId: "org_2" }]);
    // No further fields requested -> no additional queries, patch is a no-op returning the key.
    const result = await updateApiKey(admin, "key_1", {});
    expect(result).toEqual({ id: "key_1", organizationId: "org_2" });
  });

  it("validates defaultAssigneeUserId against the KEY's organization, not the caller's", async () => {
    queueResult([{ id: "key_1", organizationId: "org_1" }]); // the key itself
    queueResult([{ organizationId: "org_2" }]); // isValidAssigneeForOrg's user lookup -- mismatched org
    await expect(
      updateApiKey(superUser, "key_1", { defaultAssigneeUserId: "user_9" })
    ).rejects.toThrow("defaultAssigneeUserId is not a valid user for this key's organization.");
  });

  it("applies a valid patch and returns the updated row", async () => {
    queueResult([{ id: "key_1", organizationId: "org_1" }]); // the key itself
    queueResult([{ organizationId: "org_1" }]); // isValidAssigneeForOrg's user lookup -- matches
    queueResult([{ id: "key_1", organizationId: "org_1", defaultAssigneeUserId: "user_9", scopes: ["read", "write"] }]); // update().returning()
    const result = await updateApiKey(superUser, "key_1", { scopes: ["read", "write"], defaultAssigneeUserId: "user_9" });
    expect(result).toMatchObject({ defaultAssigneeUserId: "user_9", scopes: ["read", "write"] });
  });
});
