// Default SDLC phase per deliverable type — mirrors the free-text phase names the AI planner
// uses on tasks.phase (see plan-project/route.ts), so a deliverable lines up against the same
// lifecycle its producing tasks do. Callers may override with a project-specific phase name;
// this is only the starting suggestion when none is supplied.
export const DELIVERABLE_DEFAULT_PHASE: Record<string, string> = {
  REQUIREMENTS_NFR: "Requirements",
  DESIGN: "Design",
  FUNCTIONAL_TEST_SCRIPT: "Testing",
  UAT_SCRIPT: "UAT",
  RELEASE_DOCUMENTATION: "Deployment",
  OTHER: "",
};

export function deliverablePhaseForType(type: string): string | null {
  return DELIVERABLE_DEFAULT_PHASE[type] || null;
}
