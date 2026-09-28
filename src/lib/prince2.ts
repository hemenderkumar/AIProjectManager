import { db } from "./db";
import { settings } from "./db/schema";
import { eq } from "drizzle-orm";

// Display-layer PRINCE2 relabeling. This is deliberately NOT a new process -- there are no
// new gates, no new approval rules, no new document types beyond the two report generators in
// reportGenerator.ts. It's a vocabulary swap over artifacts that already exist (Charter,
// Business Case, gate approvals, steering committee packs) plus PRINCE2-named report
// generation, all reusing existing infra. See the comment on terminologyModeEnum in schema.ts.

export type TerminologyMode = "STANDARD" | "PRINCE2";

export const TERMINOLOGY_MODES: TerminologyMode[] = ["STANDARD", "PRINCE2"];
export const TERMINOLOGY_MODE_LABELS: Record<TerminologyMode, string> = {
  STANDARD: "Standard",
  PRINCE2: "PRINCE2",
};
export const TERMINOLOGY_MODE_DESCRIPTIONS: Record<TerminologyMode, string> = {
  STANDARD: "Plain-English labels throughout (Charter, Business Case, gate approval, steering committee).",
  PRINCE2:
    "Relabels the same artifacts with their PRINCE2 equivalents (Project Initiation Documentation, Business Case, Stage Boundary approval, Project Board) and unlocks two PRINCE2-named report types (Highlight Report, End Stage Report). No new gates or approval logic -- purely a vocabulary layer over what already exists.",
};

// Plain-English term -> PRINCE2 equivalent. Only covers the artifacts/roles this app actually
// has; PRINCE2 concepts with no counterpart here (e.g. a formal Lessons Log as its own
// artifact) are intentionally left out rather than half-implemented.
const PRINCE2_LABELS: Record<string, string> = {
  Charter: "Project Initiation Documentation (PID)",
  "Business Case": "Business Case",
  "Architecture gate": "Stage Boundary Review",
  "Gate approval": "Stage Approval",
  "Steering Committee": "Project Board",
  Sponsor: "Executive",
  "Weekly Status Report": "Highlight Report",
  "Steering committee pack": "Highlight Report",
  Milestone: "Stage",
};

export function prince2Label(term: keyof typeof PRINCE2_LABELS, mode: TerminologyMode): string {
  return mode === "PRINCE2" ? PRINCE2_LABELS[term] ?? term : term;
}

let cached: { mode: TerminologyMode; at: number } | null = null;
const CACHE_MS = 30_000;

// Same short-lived in-process cache pattern as getPmoGovernanceModel() -- read on report
// generation and (eventually) page loads that need the label set, cheap to keep fresh.
export async function getTerminologyMode(): Promise<TerminologyMode> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.mode;
  const [row] = await db.select({ terminologyMode: settings.terminologyMode }).from(settings).where(eq(settings.id, "default"));
  const mode = row?.terminologyMode ?? "STANDARD";
  cached = { mode, at: Date.now() };
  return mode;
}

export function invalidateTerminologyModeCache() {
  cached = null;
}
