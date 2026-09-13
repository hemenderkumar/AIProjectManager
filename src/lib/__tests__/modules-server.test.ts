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

import { getEnabledModules, isModuleEnabled } from "@/lib/modules-server";
import type { SessionUser } from "@/lib/auth";

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return { id: "user_1", name: "Test User", email: "t@example.com", role: "PM", organizationId: "org_a", ...overrides };
}

// This is the single gate the sidebar and every gated page checks (isEnabled() in
// Sidebar.tsx) to decide whether a client org's plan includes a given module. Getting the
// "no plan = unlimited" default backwards would either lock every org out of everything or
// let every org bypass their plan's tier entirely.
describe("getEnabledModules", () => {
  it("internal staff (no organizationId) are never gated -- no query needed", async () => {
    const result = await getEnabledModules(makeUser({ organizationId: null }));
    expect(result).toBeNull();
  });

  it("null user is never gated", async () => {
    const result = await getEnabledModules(null);
    expect(result).toBeNull();
  });

  it("an org with no plan selected gets unlimited access (null)", async () => {
    queueResult([{ planId: null }]);
    const result = await getEnabledModules(makeUser());
    expect(result).toBeNull();
  });

  it("an org on a plan gets exactly that plan's enabledModules list", async () => {
    queueResult([{ planId: "plan_pro" }]);
    queueResult([{ enabledModules: ["demand", "roadmap"] }]);
    const result = await getEnabledModules(makeUser());
    expect(result).toEqual(["demand", "roadmap"]);
  });

  it("a plan with enabledModules never set (null) also means unlimited", async () => {
    queueResult([{ planId: "plan_legacy" }]);
    queueResult([{ enabledModules: null }]);
    const result = await getEnabledModules(makeUser());
    expect(result).toBeNull();
  });
});

describe("isModuleEnabled", () => {
  it("true when the org has no restriction", async () => {
    const result = await isModuleEnabled(makeUser({ organizationId: null }), "automations");
    expect(result).toBe(true);
  });

  it("true when the module is in the plan's allowed list", async () => {
    queueResult([{ planId: "plan_pro" }]);
    queueResult([{ enabledModules: ["demand", "roadmap"] }]);
    const result = await isModuleEnabled(makeUser(), "roadmap");
    expect(result).toBe(true);
  });

  it("false when the module is missing from the plan's allowed list", async () => {
    queueResult([{ planId: "plan_pro" }]);
    queueResult([{ enabledModules: ["demand"] }]);
    const result = await isModuleEnabled(makeUser(), "vendors");
    expect(result).toBe(false);
  });
});
