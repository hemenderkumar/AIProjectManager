import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq, isNull, or, and, inArray } from "drizzle-orm";
import { verifyApiKey, extractBearerToken } from "@/lib/apiKeys";
import { dispatchWebhook } from "@/lib/webhooks";

// Ideas aren't a separate table -- they're `projects` rows that haven't yet cleared the
// Ideation gates (see ideationSubStageEnum in db/schema.ts). "Still an idea" means
// ideationSubStage is one of the three pre-Charter steps; once Charter is approved and
// resourcing is decided it's a real project, not listed here anymore. Same key-scoped
// visibility rule as /api/public/v1/projects.
const IDEA_SUB_STAGES = ["IDEA_ALIGNMENT", "TECHNICAL_FEASIBILITY", "ARCHITECTURE_REVIEW"] as const;

export async function GET(req: NextRequest) {
  const rawKey = extractBearerToken(req.headers.get("authorization"));
  if (!rawKey) return NextResponse.json({ error: "Missing Authorization: Bearer <api key>" }, { status: 401 });
  const auth = await verifyApiKey(rawKey);
  if (!auth) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });

  const stageFilter = inArray(projects.ideationSubStage, IDEA_SUB_STAGES);
  const data = auth.organizationId
    ? await db.select().from(projects).where(and(stageFilter, or(eq(projects.organizationId, auth.organizationId), isNull(projects.organizationId))))
    : await db.select().from(projects).where(stageFilter);

  return NextResponse.json({ data });
}

// Creates a new idea the same way the in-app "New Idea" flow does -- a `projects` row left at
// its default stage/ideationSubStage (INCEPTION / IDEA_ALIGNMENT), just populated with
// ideation-oriented fields instead of a full charter. Runs through the same Plan gates from
// there on, same as one created in the UI.
export async function POST(req: NextRequest) {
  const rawKey = extractBearerToken(req.headers.get("authorization"));
  if (!rawKey) return NextResponse.json({ error: "Missing Authorization: Bearer <api key>" }, { status: 401 });
  const auth = await verifyApiKey(rawKey);
  if (!auth) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  if (!auth.scopes.includes("write")) {
    return NextResponse.json({ error: "This API key doesn't have write access" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? body.title ?? "").trim();
  if (!name) return NextResponse.json({ error: "name (or title) is required" }, { status: 400 });

  const ideaType = body.ideaType === "PROBLEM" ? "PROBLEM" : "OPPORTUNITY";
  const organizationId = auth.organizationId ?? (body.organizationId || null);

  const [created] = await db
    .insert(projects)
    .values({
      name,
      organizationId,
      problemStatement: body.problemStatement || null,
      proposedSolution: body.proposedSolution || null,
      expectedBenefits: body.expectedBenefits || null,
      ideationNotes: body.ideationNotes || null,
      ideaType,
    })
    .returning();

  await dispatchWebhook(created.organizationId, "IDEA_CREATED", {
    id: created.id, name: created.name, ideaType: created.ideaType, source: "public-api",
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
