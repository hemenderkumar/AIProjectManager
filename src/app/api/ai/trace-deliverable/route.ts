import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { db } from "@/lib/db";
import { deliverables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";

const TRACEABLE_TYPES = new Set(["REQUIREMENTS_NFR", "DESIGN"]);

type TraceItem = {
  item: string;
  covered: boolean;
  matchingTaskTitle?: string;
  suggestedTaskTitle?: string;
  suggestedDescription?: string;
};
type TraceResult = { items: TraceItem[] };

// Checks whether a Requirements/NFR or Design deliverable's content is actually reflected in
// the project's task list — the point being to catch scope with no task behind it (silently
// dropped work) before it's discovered during testing or, worse, after go-live. Read-only and
// ephemeral: nothing here is persisted, matching /api/ai/incident-patterns and friends. Turning
// an uncovered item into a task is a separate, explicit action in the UI (POST
// /api/projects/[id]/tasks), not done automatically by this endpoint.
export async function POST(req: NextRequest) {
  const { deliverableId } = await req.json().catch(() => ({}));
  if (!deliverableId) return NextResponse.json({ error: "deliverableId is required" }, { status: 400 });

  const [d] = await db.select().from(deliverables).where(eq(deliverables.id, deliverableId));
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!TRACEABLE_TYPES.has(d.type)) {
    return NextResponse.json(
      { error: "Task coverage checking only applies to Requirements/NFR and Design deliverables." },
      { status: 400 }
    );
  }
  if (!d.content?.trim()) {
    return NextResponse.json({ error: "This deliverable has no content yet." }, { status: 400 });
  }

  const user = await requireProjectAccess("CONTRIBUTOR", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(d.projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const taskList = detail.tasks.map((t) => `- "${t.title}" [${t.status}]`).join("\n") || "(no tasks yet)";

  const system = `You are a PM analyst checking scope coverage. Below is a ${
    d.type === "DESIGN" ? "Detailed Design" : "Requirements & NFR"
  } document for a project, and the project's current task list.

Extract each discrete requirement or component from the document (one item per distinct requirement or
component — don't over-split a single sentence into many items, and don't invent items that aren't actually
in the document). Then, for EACH item, decide whether an existing task already covers implementing or
verifying it — match by meaning, not exact wording (e.g. "the system shall support SSO login" is covered by
a task titled "Implement single sign-on").

Document:
${d.content}

Existing tasks:
${taskList}

Respond as JSON: { "items": [{ "item": string (short name of the requirement/component), "covered": boolean,
"matchingTaskTitle": string (only if covered — the exact existing task title it matches), "suggestedTaskTitle":
string (only if NOT covered — a good task title), "suggestedDescription": string (only if NOT covered — one
sentence) }] }`;

  const { data, error } = await askClaudeJSON<TraceResult>(system, "Check task coverage now.", 4000);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  return NextResponse.json(data);
}
