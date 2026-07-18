import { NextResponse } from "next/server";
import JSZip from "jszip";
import { db } from "@/lib/db";
import { deliverables, deliverableTestCases, projects, organizations } from "@/lib/db/schema";
import { inArray, eq } from "drizzle-orm";
import { requireRole, isDownloadBlocked } from "@/lib/auth";
import { filterProjectsForUser } from "@/lib/tenancy";
import { buildSectionedDocx, buildTestCaseDocx, type DocMeta } from "@/lib/docxExport";

const TEST_TYPES = new Set(["FUNCTIONAL_TEST_SCRIPT", "UAT_SCRIPT"]);

const TYPE_LABELS: Record<string, string> = {
  REQUIREMENTS_NFR: "Requirements & NFR",
  DESIGN: "Detailed Design",
  FUNCTIONAL_TEST_SCRIPT: "Functional Test Script",
  UAT_SCRIPT: "UAT Script",
  RELEASE_DOCUMENTATION: "Release Documentation",
  OTHER: "Deliverable",
};

// Batch-regenerates every deliverable this user can see, in the new formal Keel/company-branded
// template, as a single downloadable .zip — one folder per project. Scoped through the same
// filterProjectsForUser used by the portfolio dashboard/list pages, so an ADMIN gets everything,
// a SUPER_USER gets only their own company's projects, and a PM/CONTRIBUTOR gets only the
// projects they're a member of. Detailed Design diagrams are omitted here (Mermaid needs a
// browser DOM to rasterize, which a server-side batch job doesn't have) — same limitation the
// existing plain-GET single-deliverable download already accepts for the no-diagram case.
export async function GET() {
  const user = await requireRole("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }

  const allProjects = await db
    .select({ id: projects.id, name: projects.name, organizationId: projects.organizationId })
    .from(projects);
  const visibleProjects = await filterProjectsForUser(allProjects, user);
  if (visibleProjects.length === 0) {
    return NextResponse.json({ error: "No projects visible to export deliverables from." }, { status: 404 });
  }

  const projectById = new Map(visibleProjects.map((p) => [p.id, p]));
  const orgIds = [...new Set(visibleProjects.map((p) => p.organizationId).filter((x): x is string => !!x))];
  const orgRows = orgIds.length
    ? await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, orgIds))
    : [];
  const orgNameById = new Map(orgRows.map((o) => [o.id, o.name]));

  const rows = await db
    .select()
    .from(deliverables)
    .where(inArray(deliverables.projectId, visibleProjects.map((p) => p.id)));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No deliverables found to export." }, { status: 404 });
  }

  const zip = new JSZip();
  const usedPaths = new Set<string>();
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "untitled";

  for (const d of rows) {
    const project = projectById.get(d.projectId);
    const typeLabel = TYPE_LABELS[d.type] ?? d.type;
    const meta: DocMeta = {
      documentType: `Deliverable — ${typeLabel}`,
      projectName: project?.name ?? "Untitled Project",
      companyName: project?.organizationId ? orgNameById.get(project.organizationId) ?? null : null,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      approvedBy: d.approvedBy,
      approvedAt: d.approvedAt,
    };

    let buffer: Buffer;
    if (TEST_TYPES.has(d.type)) {
      const testCases = await db.select().from(deliverableTestCases).where(eq(deliverableTestCases.deliverableId, d.id));
      buffer = await buildTestCaseDocx(d.title, typeLabel, meta, testCases);
    } else {
      const sections = [
        { heading: "Content", body: d.content ?? "" },
        {
          heading: "Approval",
          body: d.approvedBy ? `Approved by ${d.approvedBy} on ${d.approvedAt?.toLocaleDateString()}` : "Not yet approved.",
        },
      ];
      buffer = await buildSectionedDocx(d.title, typeLabel, sections, meta);
    }

    const folder = slugify(project?.name ?? "project");
    const base = slugify(d.title);
    let path = `${folder}/${base}.docx`;
    let n = 2;
    while (usedPaths.has(path)) {
      path = `${folder}/${base}-${n}.docx`;
      n++;
    }
    usedPaths.add(path);
    zip.file(path, buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="keel-deliverables-${stamp}.zip"`,
    },
  });
}
