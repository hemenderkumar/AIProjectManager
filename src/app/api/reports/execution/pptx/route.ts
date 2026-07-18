import { NextResponse } from "next/server";
import { getAllProjectsWithMetrics } from "@/lib/portfolio";
import { requireRole, isDownloadBlocked } from "@/lib/auth";
import { generateTablePptx, type TableColumn } from "@/lib/tableExport";

const EXECUTION_STAGES = ["EXECUTION", "CLOSING", "CLOSED"];
type Row = Awaited<ReturnType<typeof getAllProjectsWithMetrics>>[number];

const columns: TableColumn<Row>[] = [
  { key: "name", label: "Project", width: 2, get: (r) => r.name },
  { key: "stage", label: "Stage", width: 1.3, get: (r) => r.stage },
  { key: "priority", label: "Priority", width: 1.1, get: (r) => r.priority },
  { key: "rag", label: "Health", width: 0.9, get: (r) => r.autoRag },
  { key: "pct", label: "% Done", width: 0.9, align: "right", get: (r) => `${r.percentComplete}%` },
  { key: "budget", label: "Actual / Planned", width: 1.8, align: "right", get: (r) => `$${(r.budgetActual ?? 0).toLocaleString()} / $${(r.budgetPlanned ?? 0).toLocaleString()}` },
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

  const all = await getAllProjectsWithMetrics(user);
  const rows = all
    .filter((p) => EXECUTION_STAGES.includes(p.stage))
    .sort((a, b) => {
      if (a.stage === "CLOSED" && b.stage !== "CLOSED") return 1;
      if (b.stage === "CLOSED" && a.stage !== "CLOSED") return -1;
      const order = { RED: 0, YELLOW: 1, GREEN: 2 } as Record<string, number>;
      return order[a.autoRag] - order[b.autoRag];
    });
  const generatedAt = new Date();
  const buffer = await generateTablePptx("Project Execution", `${rows.length} projects in execution`, columns, rows, generatedAt);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="execution.pptx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
