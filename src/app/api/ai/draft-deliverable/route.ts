import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { deliverables, deliverableTestCases } from "@/lib/db/schema";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

type DeliverableType = "REQUIREMENTS_NFR" | "DESIGN" | "FUNCTIONAL_TEST_SCRIPT" | "UAT_SCRIPT" | "RELEASE_DOCUMENTATION";

const TEST_TYPES = new Set<DeliverableType>(["FUNCTIONAL_TEST_SCRIPT", "UAT_SCRIPT"]);

const DEFAULT_TITLES: Record<DeliverableType, string> = {
  REQUIREMENTS_NFR: "Detailed Requirements & Non-Functional Requirements",
  DESIGN: "Detailed Design",
  FUNCTIONAL_TEST_SCRIPT: "Functional Test Script",
  UAT_SCRIPT: "User Acceptance Test Script",
  RELEASE_DOCUMENTATION: "Release Activities & Documentation",
};

// Each type gets its own system prompt, grounded ONLY in the project's own charter/plan/
// task data passed in the user turn — never inventing scope, components, or requirements
// the project doesn't already imply.
const SYSTEM_PROMPTS: Record<DeliverableType, string> = {
  REQUIREMENTS_NFR: `You are writing a Detailed Requirements & Non-Functional Requirements (NFR) document for the
CONFIRMED scope of a software/business project, based on its charter and task plan below. Produce:
1) Functional requirements: specific, testable statements (one per line, "The system shall...") derived from
the scope, proposed solution, and task list — do not invent features outside the given scope.
2) Non-functional requirements across: performance, scalability, availability/reliability, security,
compliance/regulatory (if implied by country/industry context), usability, and maintainability — only include
categories that are actually relevant given what's known about this project.
Respond as JSON: { "title": string, "content": string (the full document as plain text with clear section
headers: "Functional Requirements" and "Non-Functional Requirements" with sub-headers per NFR category) }.`,

  DESIGN: `You are writing a Detailed Design document for the CONFIRMED scope of a project, based on its
charter, recommended technology, and task plan below. Ground everything in the project's own scope,
recommended technology, and architecture notes — do not invent an unrelated tech stack or components with
no basis in the given context. Produce these as SEPARATE pieces (they render as distinct, individually
editable sections, not one long document):

1. content: a short overview paragraph plus a brief data-flow summary — how a request/piece of data
moves through the components end to end. Do not repeat the component-by-component breakdown here; that
belongs in componentList.
2. componentList: the key components/modules that need to be built, one per line, formatted as
"ComponentName: responsibility — how it interacts with other components — key data it owns or processes".
3. architectureHighlights: 3-6 bullet points (one per line, starting with "- ") on the key architecture
decisions and why they matter — e.g. why this pattern/technology fits this project's scale, constraints,
or requirements.
4. pros: 3-5 bullet points (one per line, starting with "- ") on why this architecture is a sound choice
for this specific project.
5. cons: 2-4 bullet points (one per line, starting with "- ") on real trade-offs, risks, or limitations of
this architecture — don't invent generic caveats that don't actually apply here.
6. diagram: a simple Mermaid diagram (flowchart TD syntax) showing the SAME components listed in
componentList and how they connect — e.g. client, API/backend, database, external integrations, based on
the recommended technology. Keep it to 5-12 nodes with short labels and simple arrows (A --> B). Use only
valid Mermaid "flowchart TD" syntax with alphanumeric node ids and labels in square brackets, e.g.:
flowchart TD
  A[Web Client] --> B[API Server]
  B --> C[(Database)]
Do not include markdown code fences, just the raw Mermaid syntax starting with "flowchart TD". Don't
introduce components in the diagram that aren't in componentList, or vice versa.

Respond as JSON: { "title": string, "content": string, "componentList": string, "architectureHighlights":
string, "pros": string, "cons": string, "diagram": string (raw Mermaid flowchart TD syntax, no code
fences) }.`,

  FUNCTIONAL_TEST_SCRIPT: `You are writing a Functional Test Script for the CONFIRMED scope of a project, based
on its requirements/scope and task list below. Produce concrete, executable test cases that verify the
system behaves as specified — each with clear steps a tester can literally follow and an expected result to
check against. Cover the main scope areas and realistic edge cases; do not invent functionality outside the
given scope.
Respond as JSON: { "title": string, "testCases": [{ "scenario": string (short name), "steps": string
(numbered steps, one per line), "expectedResult": string }] } with 6-12 test cases.`,

  UAT_SCRIPT: `You are writing a User Acceptance Test (UAT) Script for the CONFIRMED scope of a project, based
on its business case/scope/expected benefits below. Unlike a functional test script (technical correctness),
these are business-facing acceptance scenarios written from the end user's/sponsor's perspective — did the
solution actually deliver the expected business outcome. Each test case should be something a business
stakeholder (not a QA engineer) can run and judge pass/fail on.
Respond as JSON: { "title": string, "testCases": [{ "scenario": string (short name, from the user's
perspective), "steps": string (what the user does, numbered, plain language), "expectedResult": string
(what the user should see/experience if this is working) }] } with 5-10 test cases.`,

  RELEASE_DOCUMENTATION: `You are writing Release Activities & Documentation for a project nearing or at
deployment, based on its scope/timeline/technology below. Cover: pre-release checklist, deployment/rollout
steps, rollback plan, required sign-offs, and a documentation checklist (release notes, runbook/support
handoff notes, end-user training materials) — only include items that make sense given what's known about
this project (e.g. don't invent infrastructure specifics that were never mentioned).
Respond as JSON: { "title": string, "content": string (the full document as plain text with clear section
headers: "Pre-Release Checklist", "Deployment Steps", "Rollback Plan", "Sign-offs Required",
"Documentation Checklist") }.`,
};

type ProjectDetailResult = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;

function buildProjectContext(detail: ProjectDetailResult) {
  const p = detail.project;
  const skillSet = new Set<string>();
  detail.tasks.forEach((t) => (t.requiredSkills ?? []).forEach((s) => skillSet.add(s)));
  return `Project: ${p.name}
Description: ${p.description || "(none)"}
Business case: ${p.businessCase || "(not yet defined)"}
Expected benefits: ${p.expectedBenefits || "(not yet defined)"}
Scope (in): ${p.scopeInScope || "(not yet defined)"}
Scope (out): ${p.scopeOutOfScope || "(not yet defined)"}
Proposed solution: ${p.proposedSolution || "(not yet defined)"}
High-level requirements: ${p.highLevelRequirements || "(not yet defined)"}
High-level architecture: ${p.highLevelArchitecture || "(not yet defined)"}
Recommended technology: ${p.recommendedTechnology || "(not yet decided)"}
Integrated systems: ${p.integratedSystems || "(none noted)"}
Country/regulatory context: ${p.country || "(not specified)"}
Task list (${detail.tasks.length} tasks): ${detail.tasks.slice(0, 40).map((t) => t.title).join("; ") || "(no tasks planned yet)"}
Skills involved: ${skillSet.size ? [...skillSet].join(", ") : "(none listed)"}`;
}

export async function POST(req: NextRequest) {
  const { projectId, type } = await req.json().catch(() => ({}));
  if (!projectId || !type || !(type in SYSTEM_PROMPTS)) {
    return NextResponse.json({ error: "projectId and a valid type are required" }, { status: 400 });
  }

  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const deliverableType = type as DeliverableType;
  const system = SYSTEM_PROMPTS[deliverableType];
  const userPrompt = buildProjectContext(detail);
  const isTestType = TEST_TYPES.has(deliverableType);

  if (isTestType) {
    const { data, error } = await askClaudeJSON<{ title: string; testCases: { scenario: string; steps: string; expectedResult: string }[] }>(system, userPrompt, 6000);
    if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

    const [created] = await db
      .insert(deliverables)
      .values({
        projectId,
        type: deliverableType,
        title: data.title || DEFAULT_TITLES[deliverableType],
        createdByAi: true,
        createdBy: user.name,
      })
      .returning();

    const testCases = data.testCases?.length
      ? await db
          .insert(deliverableTestCases)
          .values(
            data.testCases.map((tc, i) => ({
              deliverableId: created.id,
              sequence: i,
              scenario: tc.scenario,
              steps: tc.steps,
              expectedResult: tc.expectedResult,
            }))
          )
          .returning()
      : [];

    await logAudit({
      actor: user, action: "deliverable.created", entityType: "deliverable", entityId: created.id,
      detail: `${user.name} generated "${created.title}" with AI (${testCases.length} test cases).`,
    });

    return NextResponse.json({ ...created, testCases }, { status: 201 });
  }

  const { data, error } = await askClaudeJSON<{
    title: string;
    content: string;
    diagram?: string;
    componentList?: string;
    architectureHighlights?: string;
    pros?: string;
    cons?: string;
  }>(system, userPrompt, 6000);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  const isDesign = deliverableType === "DESIGN";
  const [created] = await db
    .insert(deliverables)
    .values({
      projectId,
      type: deliverableType,
      title: data.title || DEFAULT_TITLES[deliverableType],
      content: data.content,
      diagram: isDesign ? data.diagram || null : null,
      componentList: isDesign ? data.componentList || null : null,
      architectureHighlights: isDesign ? data.architectureHighlights || null : null,
      pros: isDesign ? data.pros || null : null,
      cons: isDesign ? data.cons || null : null,
      createdByAi: true,
      createdBy: user.name,
    })
    .returning();

  await logAudit({
    actor: user, action: "deliverable.created", entityType: "deliverable", entityId: created.id,
    detail: `${user.name} generated "${created.title}" with AI.`,
  });

  return NextResponse.json({ ...created, testCases: [] }, { status: 201 });
}
