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

import {
  scopeFor,
  isInternalStaff,
  canAccessProject,
  filterProjectsForUser,
  listVisibleProjects,
} from "@/lib/tenancy";
import type { SessionUser } from "@/lib/auth";

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return { id: "user_1", name: "Test User", email: "t@example.com", role: "PM", organizationId: "org_a", ...overrides };
}

describe("scopeFor", () => {
  it("ADMIN is GLOBAL", () => expect(scopeFor("ADMIN")).toBe("GLOBAL"));
  it("SUPER_USER is ORGANIZATION", () => expect(scopeFor("SUPER_USER")).toBe("ORGANIZATION"));
  it("PM/CONTRIBUTOR/VIEWER are PROJECT", () => {
    expect(scopeFor("PM")).toBe("PROJECT");
    expect(scopeFor("CONTRIBUTOR")).toBe("PROJECT");
    expect(scopeFor("VIEWER")).toBe("PROJECT");
  });
});

describe("isInternalStaff", () => {
  it("true when organizationId is null (Executa's own team)", () => {
    expect(isInternalStaff(makeUser({ organizationId: null }))).toBe(true);
  });
  it("false for a client-company user, even a SUPER_USER", () => {
    expect(isInternalStaff(makeUser({ role: "SUPER_USER", organizationId: "org_a" }))).toBe(false);
  });
});

// canAccessProject is the single source of truth every /api/projects/[id]/** route depends
// on for cross-tenant isolation (see requireProjectAccess). This is the highest blast-radius
// function in the app -- a regression here means one client seeing another client's data.
describe("canAccessProject", () => {
  it("ADMIN can access any project without even querying it", async () => {
    const ok = await canAccessProject(makeUser({ role: "ADMIN" }), "proj_1");
    expect(ok).toBe(true);
  });

  it("returns false if the project doesn't exist", async () => {
    queueResult([]); // project lookup
    const ok = await canAccessProject(makeUser({ role: "SUPER_USER" }), "proj_missing");
    expect(ok).toBe(false);
  });

  it("SUPER_USER can access a project that belongs to their own org", async () => {
    queueResult([{ organizationId: "org_a" }]); // project lookup
    const ok = await canAccessProject(makeUser({ role: "SUPER_USER", organizationId: "org_a" }), "proj_1");
    expect(ok).toBe(true);
  });

  it("SUPER_USER cannot access another org's project", async () => {
    queueResult([{ organizationId: "org_b" }]); // project belongs to a different org
    const ok = await canAccessProject(makeUser({ role: "SUPER_USER", organizationId: "org_a" }), "proj_1");
    expect(ok).toBe(false);
  });

  it("PM needs an explicit project membership row, even inside their own org", async () => {
    queueResult([{ organizationId: "org_a" }]); // project lookup
    queueResult([]); // no membership row found
    const ok = await canAccessProject(makeUser({ role: "PM", organizationId: "org_a" }), "proj_1");
    expect(ok).toBe(false);
  });

  it("PM with a membership row can access the project", async () => {
    queueResult([{ organizationId: "org_a" }]); // project lookup
    queueResult([{ id: "membership_1" }]); // membership found
    const ok = await canAccessProject(makeUser({ role: "PM", organizationId: "org_a" }), "proj_1");
    expect(ok).toBe(true);
  });
});

describe("filterProjectsForUser", () => {
  const projects = [
    { id: "p1", organizationId: "org_a" },
    { id: "p2", organizationId: "org_b" },
    { id: "p3", organizationId: null },
  ];

  it("no user means unfiltered (internal/cron callers)", async () => {
    const result = await filterProjectsForUser(projects, null);
    expect(result).toEqual(projects);
  });

  it("ADMIN sees everything", async () => {
    const result = await filterProjectsForUser(projects, makeUser({ role: "ADMIN" }));
    expect(result).toEqual(projects);
  });

  it("SUPER_USER only sees their own org's projects", async () => {
    const result = await filterProjectsForUser(projects, makeUser({ role: "SUPER_USER", organizationId: "org_a" }));
    expect(result).toEqual([projects[0]]);
  });

  it("SUPER_USER with no organizationId sees nothing", async () => {
    const result = await filterProjectsForUser(projects, makeUser({ role: "SUPER_USER", organizationId: null }));
    expect(result).toEqual([]);
  });

  it("PM only sees projects they're an explicit member of", async () => {
    queueResult([{ projectId: "p2" }]); // membership rows
    const result = await filterProjectsForUser(projects, makeUser({ role: "PM" }));
    expect(result).toEqual([projects[1]]);
  });
});

describe("listVisibleProjects", () => {
  it("ADMIN gets every project", async () => {
    queueResult([{ id: "p1" }, { id: "p2" }]);
    const result = await listVisibleProjects(makeUser({ role: "ADMIN" }));
    expect(result).toHaveLength(2);
  });

  it("SUPER_USER with no org gets an empty list without querying", async () => {
    const result = await listVisibleProjects(makeUser({ role: "SUPER_USER", organizationId: null }));
    expect(result).toEqual([]);
  });

  it("PM with no memberships short-circuits to an empty list (skips the second query)", async () => {
    queueResult([]); // membership lookup returns nothing
    const result = await listVisibleProjects(makeUser({ role: "PM" }));
    expect(result).toEqual([]);
  });

  it("PM with memberships resolves to their projects", async () => {
    queueResult([{ projectId: "p1" }]); // membership lookup
    queueResult([{ id: "p1" }]); // projects-by-id lookup
    const result = await listVisibleProjects(makeUser({ role: "PM" }));
    expect(result).toEqual([{ id: "p1" }]);
  });
});
