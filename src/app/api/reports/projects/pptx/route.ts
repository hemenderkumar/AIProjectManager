import { NextResponse } from "next/server";
import { getAllProjectsWithMetrics } from "@/lib/portfolio";
import { requireRole } from "@/lib/auth";
import { generateTablePptx, type TableColumn } from "@/lib/tableExport";

type Row = Awaited<ReturnType<typeof getAllProjectsWithMetrics>>[number];

const columns: TableColumn<Row>[] = [
  { key: "name", label: "Project", width: 2.2, get: (r) => r.name },
  { key: "stage", label: "Stage", width: 1.3, get: (r) => r.stage },
  { key: "priority", label: "Priority", width: 1.1, get: (r) => r.priority },
  { key: "rag", label: "Health", width: 0.9, get: (r) => r.autoRag },
  { key: "pct", label: "% Done", width: 0.9, align: "right", get: (r) => `${r.percentComplete}%` },
  { key: "budget", label: "Actual / Planned", width: 1.8, align: "right", get: (r) => `$${(r.budgetActual ?? 0).toLocaleString()} / $${(r.budgetPlanned ?? 0).toLocaleString()}` },
  { key: "pm", label: "PM", width: 1.2, get: (r) => r.projectManager ?? "—" },
];

export async function POST() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await getAllProjectsWithMetrics(user);
  const generatedAt = new Date();
  const buffer = await generateTablePptx("All Projects", `${rows.length} total projects`, columns, rows, generatedAt);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="projects.pptx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
