// The fixed set of lifecycle modules a plan can gate. Deliberately excludes anything core to
// simply using the tracker at all (Dashboard, Projects + their detail tabs, Templates, AI
// Assistant, My Organization, Billing) -- those are never toggle-able, on any plan, so an org
// can never be locked out of its own project data. Also deliberately excludes Ideation: it's
// not a bolt-on feature, it's how every project's Charter stage actually works (see the Plan
// tab's gated sub-tabs), so gating it would be gating a piece of the core workflow, not an
// add-on. Everything below is a genuinely separable surface with its own top-level page.
//
// No server-only imports here (no db, no drizzle) -- this file is imported from client
// components (e.g. the admin Plans page checkboxes) as well as server code. The actual
// DB-backed lookups (getEnabledModules/isModuleEnabled) live in lib/modules-server.ts.
export const MODULE_REGISTRY = {
  demand: { label: "Demand Management", description: "Public intake + triage of raw project requests" },
  roadmap: { label: "Roadmap", description: "Quick-wins vs. long-term investment planning" },
  support: { label: "Ongoing Support", description: "Portfolio-wide incident management" },
  vendor_evaluation: { label: "Vendor Evaluation", description: "RFP drafting + AI-scored vendor comparison" },
  vendors: { label: "Vendor Scorecard", description: "Cross-project vendor performance tracking" },
  automations: { label: "Automations", description: "Rule-based triggers (task overdue, risk logged, etc.)" },
  integrations: { label: "API & Integrations", description: "API keys + outbound webhooks" },
} as const;

export type ModuleKey = keyof typeof MODULE_REGISTRY;
export const MODULE_KEYS = Object.keys(MODULE_REGISTRY) as ModuleKey[];
