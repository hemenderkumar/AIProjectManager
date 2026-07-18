import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliverables, deliverableTestCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { buildSectionedDocx, buildTestCaseDocx, docxHeaders } from "@/lib/docxExport";

const TEST_TYPES = new Set(["FUNCTIONAL_TEST_SCRIPT", "UAT_SCRIPT"]);

const TYPE_LABELS: Record<string, string> = {
  REQUIREMENTS_NFR: "Requirements & NFR",
  DESIGN: "Detailed Design",
  FUNCTIONAL_TEST_SCRIPT: "Functional Test Script",
  UAT_SCRIPT: "UAT Script",
  RELEASE_DOCUMENTATION: "Release Documentation",
  OTHER: "Deliverable",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d] = await db.select().from(deliverables).where(eq(deliverables.id, id));
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await requireProjectAccess("VIEWER", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const subtitle = `${TYPE_LABELS[d.type] ?? d.type} — status: ${d.status.replace("_", " ")}`;
  const slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "deliverable";

  let buffer: Buffer;
  if (TEST_TYPES.has(d.type)) {
    const testCases = await db
      .select()
      .from(deliverableTestCases)
      .where(eq(deliverableTestCases.deliverableId, id));
    buffer = await buildTestCaseDocx(d.title, subtitle, testCases);
  } else {
    const sections = [
      { heading: "Content", body: d.content ?? "" },
      {
        heading: "Approval",
        body: d.approvedBy ? `Approved by ${d.approvedBy} on ${d.approvedAt?.toLocaleDateString()}` : "Not yet approved.",
      },
    ];
    buffer = await buildSectionedDocx(d.title, subtitle, sections);
  }

  return new NextResponse(new Uint8Array(buffer), { headers: docxHeaders(`${slug}.docx`) });
}
