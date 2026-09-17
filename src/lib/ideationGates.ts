// The Plan tab's 6 gated sub-tabs (Idea & Alignment -> Technical Feasibility ->
// Architecture -> Financial Forecast & Projections -> Scope & Charter -> Resourcing Decision)
// and how they map onto the pre-existing, coarser `stage` column so every existing
// stage-based query (dashboard counts, EXECUTION_STAGES/IDEATION_STAGES report filters, AI
// prompts) keeps working unchanged. `stage` is still a real, queryable column -- it's just no
// longer directly PM-editable for these sub-stages; see the PATCH handler in
// api/projects/[id]/route.ts. CLOSING/CLOSED remain manually settable, since project closeout
// is a separate lifecycle event this gated sequence doesn't model.
//
// BUSINESS_CASE (displayed as "Financial Forecast & Projections") sits between Architecture
// and Charter: it's the investor/funding-committee-facing pitch that answers "should we do
// this and why" -- problem, business case narrative, SWOT, market analysis/prediction &
// sizing, competitive differentiation, revenue projections, and a benefits/ROI forecast --
// before Charter answers "here's the authorized scope/cost/plan to execute it." The internal
// key stays BUSINESS_CASE (DB column names, code identifiers) so nothing downstream breaks;
// only the label shown to users changed. See BusinessCaseWorkspace.tsx.
import type { projectStageEnum } from "./db/schema";

export const SUB_STAGE_ORDER = [
  "IDEA_ALIGNMENT",
  "TECHNICAL_FEASIBILITY",
  "ARCHITECTURE_REVIEW",
  "BUSINESS_CASE",
  "CHARTER",
  "RESOURCING_DECISION",
  "READY_FOR_EXECUTION",
] as const;

export type IdeationSubStage = (typeof SUB_STAGE_ORDER)[number];

export const SUB_STAGE_LABELS: Record<IdeationSubStage, string> = {
  IDEA_ALIGNMENT: "Idea & Alignment",
  TECHNICAL_FEASIBILITY: "Technical Feasibility",
  ARCHITECTURE_REVIEW: "Architecture",
  BUSINESS_CASE: "Financial Forecast & Projections",
  CHARTER: "Scope & Charter",
  RESOURCING_DECISION: "Resourcing Decision",
  READY_FOR_EXECUTION: "Ready for Execution",
};

export const STAGE_FOR_SUB_STAGE: Record<IdeationSubStage, (typeof projectStageEnum.enumValues)[number]> = {
  IDEA_ALIGNMENT: "INCEPTION",
  TECHNICAL_FEASIBILITY: "IDEATION",
  ARCHITECTURE_REVIEW: "IDEATION",
  BUSINESS_CASE: "IDEATION",
  CHARTER: "CHARTER",
  RESOURCING_DECISION: "CHARTER",
  READY_FOR_EXECUTION: "EXECUTION",
};

export function subStageIndex(subStage: string): number {
  return SUB_STAGE_ORDER.indexOf(subStage as IdeationSubStage);
}

// A sub-tab is reachable once the project's current sub-stage has reached it -- i.e. every
// gate before it has already been satisfied. Always reachable looking backward (you can
// always go re-read an earlier, already-confirmed step).
export function isSubStageUnlocked(currentSubStage: string, target: IdeationSubStage): boolean {
  return subStageIndex(currentSubStage) >= subStageIndex(target);
}
