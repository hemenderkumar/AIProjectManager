import { db } from "./db";
import { settings } from "./db/schema";
import { eq } from "drizzle-orm";
import type { SessionUser } from "./auth";

export type PmoGovernanceModel = "SUPPORTIVE" | "CONTROLLING" | "DIRECTIVE" | "ENTERPRISE";

// Which Ideation gate approval this applies to. Resourcing/READY_FOR_EXECUTION are deliberately
// left out -- resourcing-decision already has its own dedicated approval flow with its own
// access rule, and adding a second layer there would just be confusing.
export type PmoGate = "ARCHITECTURE" | "BUSINESS_CASE" | "CHARTER";

export const PMO_GOVERNANCE_MODELS: PmoGovernanceModel[] = ["SUPPORTIVE", "CONTROLLING", "DIRECTIVE", "ENTERPRISE"];

export const PMO_GOVERNANCE_LABELS: Record<PmoGovernanceModel, string> = {
  SUPPORTIVE: "Supportive",
  CONTROLLING: "Controlling",
  DIRECTIVE: "Directive",
  ENTERPRISE: "Enterprise",
};

export const PMO_GOVERNANCE_DESCRIPTIONS: Record<PmoGovernanceModel, string> = {
  SUPPORTIVE:
    "Lightest touch. Whoever is working the idea (any Contributor or above) can approve their own Architecture, Business Case, and Charter gates.",
  CONTROLLING:
    "The PMO sets and checks standards. Gate approvals require PM tier or above -- a Contributor can prepare the material but a PM has to sign off.",
  DIRECTIVE:
    "The PMO directly manages projects. Gate approvals require a company owner (SUPER_USER) or above.",
  ENTERPRISE:
    "Fully centralized, portfolio-wide governance. Gate approvals require an Executa administrator.",
};

// The minimum project role allowed to set each gate's approval fields
// (architectureApprovedAt / businessCaseApprovedAt / charterApprovedAt) under a given
// governance model. Same for every gate today -- kept as a per-gate map (not one flat role)
// so a future model could tighten one gate without the others.
const MIN_ROLE_BY_MODEL: Record<PmoGovernanceModel, SessionUser["role"]> = {
  SUPPORTIVE: "CONTRIBUTOR",
  CONTROLLING: "PM",
  DIRECTIVE: "SUPER_USER",
  ENTERPRISE: "ADMIN",
};

export function minApproverRoleFor(model: PmoGovernanceModel, _gate: PmoGate): SessionUser["role"] {
  return MIN_ROLE_BY_MODEL[model];
}

let cached: { model: PmoGovernanceModel; at: number } | null = null;
const CACHE_MS = 30_000; // this is read on every gate-approval PATCH -- avoid a query per request

// The org-wide governance model is a single settings row (see schema.ts), not per-project --
// short-lived in-process cache since it changes rarely (an admin toggling it in Admin >
// Automation settings) but is read on the hot path of every Ideation gate approval.
export async function getPmoGovernanceModel(): Promise<PmoGovernanceModel> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.model;
  const [row] = await db.select({ pmoGovernanceModel: settings.pmoGovernanceModel }).from(settings).where(eq(settings.id, "default"));
  const model = row?.pmoGovernanceModel ?? "SUPPORTIVE";
  cached = { model, at: Date.now() };
  return model;
}

// Call after an admin changes the setting so the very next gate check sees it immediately
// instead of waiting out the cache window.
export function invalidatePmoGovernanceCache() {
  cached = null;
}
