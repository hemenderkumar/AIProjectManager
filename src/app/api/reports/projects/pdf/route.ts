import { NextResponse } from "next/server";
import { getAllProjectsWithMetrics } from "@/lib/portfolio";
import { requireRole } from "@/lib/auth";
import { generateTablePdf, type TableColumn } from "@/lib/tableExport";

type Row = Awaited<ReturnType<typeof getAllProjectsWithMetrics>>[number];

const columns: TableColumn<Row>[] = [
  { key: "name", label: "Project", width: 2.2, get: (r) => r.name },
  { key: "stage", label: "Stage", get: (r) => r.stage },
  { key: "priority", label: "Priority", get: (r) => r.priority },
  { key: "rag", label: "Health", get: (r) => r.autoRag },
  { key: "pct", label: "% Complete", align: "right", get: (r) => `${r.percentComplete}%` },
  { key: "budget", label: "Budget (Actual/Planned)", width: 1.6, align: "right", get: (r) => `$${(r.budgetActual ?? 0).toLocaleString()} / $${(r.budgetPlanned ?? 0).toLocaleString()}` },
  { key: "pm", label: "PM", get: (r) => r.projectManager ?? "—" },
];

export async function POST() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await getAllProjectsWithMetrics(user);
  const generatedAt = new Date();
  const buffer = await generateTablePdf("All Projects", `${rows.length} total projects`, columns, rows, generatedAt);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="projects.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
