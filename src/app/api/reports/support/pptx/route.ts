import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { incidents, projects } from "@/lib/db/schema";
import { requireRole, isDownloadBlocked } from "@/lib/auth";
import { canAccessOptionalProject } from "@/lib/tenancy";
import { generateTablePptx, type TableColumn } from "@/lib/tableExport";

type Row = typeof incidents.$inferSelect & { projectName: string };

const columns: TableColumn<Row>[] = [
  { key: "title", label: "Incident", width: 2, get: (r) => r.title },
  { key: "project", label: "Project", get: (r) => r.projectName },
  { key: "severity", label: "Severity", get: (r) => r.severity },
  { key: "status", label: "Status", get: (r) => r.status },
  { key: "reportedAt", label: "Reported", get: (r) => r.reportedAt.toLocaleDateString("en-US") },
];

export async function POST() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }

  const [allIncidents, allProjects] = await Promise.all([
    db.select().from(incidents),
    db.select({ id: projects.id, name: projects.name }).from(projects),
  ]);
  const nameById = new Map(allProjects.map((p) => [p.id, p.name]));

  const visible = (
    await Promise.all(
      allIncidents.map(async (i) =>
        (await canAccessOptionalProject(user, i.projectId)) ? { ...i, projectName: i.projectId ? nameById.get(i.projectId) ?? "—" : "General" } : null
      )
    )
  ).filter((i): i is Row => i !== null);

  visible.sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());

  const generatedAt = new Date();
  const buffer = await generateTablePptx("Ongoing Support — Incidents", `${visible.length} incidents`, columns, visible, generatedAt);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="support-incidents.pptx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
