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

import { slugify, extractEmailAddress, createEmailRoute, updateEmailRoute } from "@/lib/emailIntake";
import type { SessionUser } from "@/lib/auth";

// slugify is what turns an org's display name into the human-readable prefix of its generated
// inbound address -- it must never produce something that breaks a valid email local-part or
// leaks characters an admin didn't expect to see in their address.
describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Acme Corp")).toBe("acme-corp");
  });

  it("strips characters outside a-z0-9 and collapses them to single hyphens", () => {
    expect(slugify("Acme & Sons, Inc.!!")).toBe("acme-sons-inc");
  });

  it("falls back to 'org' for an empty or fully-stripped name", () => {
    expect(slugify("")).toBe("org");
    expect(slugify("!!!")).toBe("org");
  });

  it("truncates very long names", () => {
    expect(slugify("a".repeat(50)).length).toBeLessThanOrEqual(24);
  });
});

// extractEmailAddress is what lib/emailIntake.ts's createIncidentFromEmail relies on to match
// a sender against a real Executa user -- getting this wrong means a legitimate teammate's
// email never gets linked as reportedByUserId, or (worse) a malformed header matches the wrong
// person.
describe("extractEmailAddress", () => {
  it("extracts the address from a display-name header", () => {
    expect(extractEmailAddress("Jane Doe <jane@acme.com>")).toBe("jane@acme.com");
  });

  it("lowercases the result", () => {
    expect(extractEmailAddress("Jane Doe <Jane@Acme.COM>")).toBe("jane@acme.com");
  });

  it("passes through a bare address unchanged (aside from casing/trim)", () => {
    expect(extractEmailAddress(" jane@acme.com ")).toBe("jane@acme.com");
  });
});

// createEmailRoute must refuse to generate an address for an internal (org-less) staff account
// -- an inbound address only ever makes sense scoped to a real customer organization -- and
// must validate projectId/defaultAssigneeUserId the same way createApiKey does.
describe("createEmailRoute", () => {
  const orgUser: SessionUser = {
    id: "user_1", name: "Test User", email: "test@example.com", role: "SUPER_USER", organizationId: "org_1",
  } as SessionUser;
  const internalUser: SessionUser = {
    id: "staff_1", name: "Staff", email: "staff@example.com", role: "ADMIN", organizationId: null,
  } as SessionUser;

  it("throws for an internal (org-less) account", async () => {
    await expect(createEmailRoute(internalUser, {})).rejects.toThrow(
      "Email intake is only available for a client organization, not an internal staff account."
    );
  });

  it("throws when the user cannot access the requested project", async () => {
    queueResult([{ id: "proj_1", organizationId: "org_2" }]); // canAccessProject's own lookup
    await expect(createEmailRoute(orgUser, { projectId: "proj_1" })).rejects.toThrow(
      "You don't have access to that project."
    );
  });
});

// updateEmailRoute is the same "reconfigure without regenerating" mechanism as updateApiKey --
// an admin should be able to retarget an already-shared inbound address without every sender
// having to learn a new one.
describe("updateEmailRoute", () => {
  const orgUser: SessionUser = {
    id: "user_1", name: "Test User", email: "test@example.com", role: "SUPER_USER", organizationId: "org_1",
  } as SessionUser;

  it("throws when the address doesn't exist", async () => {
    queueResult([]);
    await expect(updateEmailRoute(orgUser, "route_missing", { isActive: false })).rejects.toThrow(
      "Email intake address not found."
    );
  });

  it("throws when a SUPER_USER tries to manage another organization's address", async () => {
    queueResult([{ id: "route_1", organizationId: "org_2" }]);
    await expect(updateEmailRoute(orgUser, "route_1", { isActive: false })).rejects.toThrow(
      "You don't have access to that email intake address."
    );
  });

  it("applies a valid patch", async () => {
    queueResult([{ id: "route_1", organizationId: "org_1" }]); // the route itself
    queueResult([{ id: "route_1", organizationId: "org_1", isActive: false }]); // update().returning()
    const result = await updateEmailRoute(orgUser, "route_1", { isActive: false });
    expect(result).toMatchObject({ isActive: false });
  });
});
