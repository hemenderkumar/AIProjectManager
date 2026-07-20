// The Plan tab's 5 gated sub-tabs (Idea & Alignment -> Technical Feasibility ->
// Architecture -> Scope & Charter -> Resourcing Decision) and how they map onto the
// pre-existing, coarser `stage` column so every existing stage-based query (dashboard
// counts, EXECUTION_STAGES/IDEATION_STAGES report filters, AI prompts) keeps working
// unchanged. `stage` is still a real, queryable column -- it's just no longer directly
// PM-editable for these five sub-stages; see the PATCH handler in
// api/projects/[id]/route.ts. CLOSING/CLOSED remain manually settable, since project
// closeout is a separate lifecycle event this gated sequence doesn't model.
import type { projectStageEnum } from "./db/schema";

export const SUB_STAGE_ORDER = [
  "IDEA_ALIGNMENT",
  "TECHNICAL_FEASIBILITY",
  "ARCHITECTURE_REVIEW",
  "CHARTER",
  "RESOURCING_DECISION",
  "READY_FOR_EXECUTION",
] as const;

export type IdeationSubStage = (typeof SUB_STAGE_ORDER)[number];

export const SUB_STAGE_LABELS: Record<IdeationSubStage, string> = {
  IDEA_ALIGNMENT: "Idea & Alignment",
  TECHNICAL_FEASIBILITY: "Technical Feasibility",
  ARCHITECTURE_REVIEW: "Architecture",
  CHARTER: "Scope & Charter",
  RESOURCING_DECISION: "Resourcing Decision",
  READY_FOR_EXECUTION: "Ready for Execution",
};

export const STAGE_FOR_SUB_STAGE: Record<IdeationSubStage, (typeof projectStageEnum.enumValues)[number]> = {
  IDEA_ALIGNMENT: "INCEPTION",
  TECHNICAL_FEASIBILITY: "IDEATION",
  ARCHITECTURE_REVIEW: "IDEATION",
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
