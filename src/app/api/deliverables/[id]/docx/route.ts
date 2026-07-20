import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliverables, deliverableTestCases, projects, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { isDownloadBlocked } from "@/lib/auth";
import { buildSectionedDocx, buildTestCaseDocx, docxHeaders, type DiagramImage, type DocMeta } from "@/lib/docxExport";

const TEST_TYPES = new Set(["FUNCTIONAL_TEST_SCRIPT", "UAT_SCRIPT"]);

const TYPE_LABELS: Record<string, string> = {
  REQUIREMENTS_NFR: "Requirements & NFR",
  DESIGN: "Detailed Design",
  FUNCTIONAL_TEST_SCRIPT: "Functional Test Script",
  UAT_SCRIPT: "UAT Script",
  RELEASE_DOCUMENTATION: "Release Documentation",
  OTHER: "Deliverable",
};

type DeliverableRow = typeof deliverables.$inferSelect;

// Company vs Keel branding: a project's organizationId is the client company it's for (null =
// internal-only, per the schema comment on projects.organizationId) — that's the whole decision,
// no separate "company" concept or logo/branding table exists. Resolved fresh per export rather
// than cached, so renaming a company or moving a project to a different one is picked up
// immediately without needing to regenerate anything by hand.
async function loadDocMeta(d: DeliverableRow, typeLabel: string): Promise<DocMeta> {
  const [project] = await db
    .select({ name: projects.name, organizationId: projects.organizationId })
    .from(projects)
    .where(eq(projects.id, d.projectId));

  let companyName: string | null = null;
  if (project?.organizationId) {
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, project.organizationId));
    companyName = org?.name ?? null;
  }

  return {
    documentType: `Deliverable — ${typeLabel}`,
    projectName: project?.name ?? "Untitled Project",
    companyName,
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    approvedBy: d.approvedBy,
    approvedAt: d.approvedAt,
  };
}

async function renderDocx(d: DeliverableRow, diagram: DiagramImage | null): Promise<{ buffer: Buffer; slug: string }> {
  const typeLabel = TYPE_LABELS[d.type] ?? d.type;
  const meta = await loadDocMeta(d, typeLabel);
  const slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "deliverable";

  let buffer: Buffer;
  if (TEST_TYPES.has(d.type)) {
    const testCases = await db.select().from(deliverableTestCases).where(eq(deliverableTestCases.deliverableId, d.id));
    buffer = await buildTestCaseDocx(d.title, typeLabel, meta, testCases);
  } else {
    // Component List / Architecture Highlights / Pros / Cons are DESIGN-only structured
    // fields (see schema.ts) — buildSectionedDocx already skips any section with an empty
    // body, so listing them unconditionally is safe for every other deliverable type too.
    const sections = [
      { heading: "Executive Summary", body: d.executiveSummary ?? "" },
      { heading: "Content", body: d.content ?? "" },
      { heading: "Component List", body: d.componentList ?? "" },
      { heading: "Architecture Highlights", body: d.architectureHighlights ?? "" },
      { heading: "Pros", body: d.pros ?? "" },
      { heading: "Cons", body: d.cons ?? "" },
      {
        heading: "Approval",
        body: d.approvedBy ? `Approved by ${d.approvedBy} on ${d.approvedAt?.toLocaleDateString()}` : "Not yet approved.",
      },
    ];
    buffer = await buildSectionedDocx(d.title, typeLabel, sections, meta, diagram, "Content");
  }
  return { buffer, slug };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d] = await db.select().from(deliverables).where(eq(deliverables.id, id));
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await requireProjectAccess("VIEWER", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }

  // No diagram on this path — the plain GET link works with just the text, so downloading
  // still works even if a client can't render Mermaid (e.g. a bookmarked/shared link opened
  // directly). The richer POST path below is what the Deliverables tab actually uses when a
  // diagram is present, so it can embed a real picture.
  const { buffer, slug } = await renderDocx(d, null);
  return new NextResponse(new Uint8Array(buffer), { headers: docxHeaders(`${slug}.docx`) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d] = await db.select().from(deliverables).where(eq(deliverables.id, id));
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await requireProjectAccess("VIEWER", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const diagram: DiagramImage | null =
    body?.diagram?.svgBase64 && body?.diagram?.pngBase64 ? (body.diagram as DiagramImage) : null;

  const { buffer, slug } = await renderDocx(d, diagram);
  return new NextResponse(new Uint8Array(buffer), { headers: docxHeaders(`${slug}.docx`) });
}
