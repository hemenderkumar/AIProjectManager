import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";

type FeasibilityResult = {
  technicalApproach: string;
  feasibilityScore: number;
  feasibilityRating: "Low" | "Medium" | "High";
  keyRisks: string[];
  openQuestions: string[];
  assumptions: string[];
  // Populated only for a non-software idea (see isBuildCategory below) -- the "Build
  // Requirements" equivalent of technicalApproach: what it physically takes to build this,
  // not what code to write. Left absent/empty for a software idea rather than forced blank
  // text, so the UI can tell "not applicable" apart from "AI returned nothing here".
  buildMaterials?: string;
  buildInfrastructure?: string;
  buildSourcing?: string;
  // Any capability this idea depends on that doesn't exist yet and would itself need to be
  // scoped/built (e.g. a foot-scanning app for a custom-shoe idea) -- named explicitly rather
  // than buried in openQuestions, so a hard prerequisite doesn't get read as just another
  // open question.
  dependentSubBuilds?: string[];
};

// Idea categories that are build-shaped (materials/infrastructure/sourcing) rather than, or
// in addition to, software-shaped (tech stack). HARDWARE_PHYSICAL always is; SERVICE/OTHER
// are asked for build requirements too when they're not purely software delivery, since
// "service" covers plenty of physical-world operations.
function isBuildCategory(category: string | null | undefined): boolean {
  return category === "HARDWARE_PHYSICAL" || category === "SERVICE" || category === "OTHER";
}

export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const _authUser = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;

  if (!p.proposedSolution?.trim() && !p.description?.trim()) {
    return NextResponse.json(
      { error: "Add a proposed solution or description first — there's not enough to assess feasibility from yet." },
      { status: 400 }
    );
  }

  const buildAware = isBuildCategory(p.ideaCategory) || p.hasSoftwareComponent;

  const system = `You are a pragmatic technical lead doing an early feasibility assessment of a proposed
project. Ground everything ONLY in the information given below — do not invent specific vendors,
technologies, integrations, prior incidents, or costs that weren't mentioned. Where something is
genuinely uncertain from the given information, say so explicitly in "assumptions" or "openQuestions"
rather than stating it as fact. feasibilityScore is 0-100 reflecting how confident a team could be
executing this with normal effort given only what's described (not a guess dressed as precision — round
to the nearest 5 and note in assumptions if the basis for the score is thin). If this idea has little or
no real prior art (nobody has built something like it before, or you're not confident it's been done),
say so plainly in technicalApproach and lean harder on assumptions/openQuestions rather than a
falsely-confident score — a genuinely novel idea's feasibility rests on unproven assumptions, and that
should read as unproven, not as a polished-looking number.
${
  isBuildCategory(p.ideaCategory)
    ? `This idea is a physical/build product (category: ${p.ideaCategory}), not primarily software. In
addition to the fields below, also fill in: "buildMaterials" (the materials/components this physically
needs — 2-4 sentences), "buildInfrastructure" (equipment/facility/process needed to actually produce it —
2-4 sentences), and "buildSourcing" (typical CATEGORIES of supplier to source from — e.g. "contract
manufacturers", "industrial equipment suppliers" — never a specific real company name or a price, since
none were given).`
    : ""
}
Also check explicitly: does this idea depend on some OTHER capability that doesn't exist yet and would
itself need its own scoping/build effort (e.g. a measurement/scanning app, a payment integration, a
regulatory approval, a hardware sensor)? If so, name it/them in "dependentSubBuilds" — don't just fold it
into openQuestions, since a hard missing prerequisite is a different kind of gap than an open question.
Empty array if nothing like that applies.
Respond as JSON: { "technicalApproach": string (2-4 sentences, high level, no invented specifics),
"feasibilityScore": number, "feasibilityRating": "Low"|"Medium"|"High",
"keyRisks": string[] (3-5 items), "openQuestions": string[] (3-5 items),
"assumptions": string[] (2-4 things being assumed given limited info)${
    isBuildCategory(p.ideaCategory) ? `, "buildMaterials": string, "buildInfrastructure": string, "buildSourcing": string` : ""
  }, "dependentSubBuilds": string[] }.`;

  const user = `Project name: ${p.name}
Idea category: ${p.ideaCategory || "(not set — treat as software unless the description clearly says otherwise)"}
Has a software component: ${p.hasSoftwareComponent ? "yes" : "no"}
Description: ${p.description || "(not provided)"}
Problem statement: ${p.problemStatement || "(not provided)"}
Proposed solution: ${p.proposedSolution || "(not provided)"}
Expected benefits: ${p.expectedBenefits || "(not provided)"}
Integrated systems (from charter, if any): ${p.integratedSystems || "(not provided)"}
High-level architecture (from charter, if any): ${p.highLevelArchitecture || "(not provided)"}`;

  const { data, error } = await askClaudeJSON<FeasibilityResult>(system, user, buildAware ? 2000 : 1500);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  if (!isBuildCategory(p.ideaCategory)) {
    // Never let the model's own judgment override the category the user actually set —
    // drop build fields for a software idea even if the model returned something anyway.
    delete data.buildMaterials;
    delete data.buildInfrastructure;
    delete data.buildSourcing;
  }
  return NextResponse.json(data);
}
