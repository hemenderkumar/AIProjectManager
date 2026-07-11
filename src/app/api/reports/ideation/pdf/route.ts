import { NextResponse } from "next/server";
import { getAllProjectsWithMetrics } from "@/lib/portfolio";
import { requireRole } from "@/lib/auth";
import { generateTablePdf, type TableColumn } from "@/lib/tableExport";

const IDEATION_STAGES = ["INCEPTION", "IDEATION", "CHARTER"];
type Row = Awaited<ReturnType<typeof getAllProjectsWithMetrics>>[number];

const columns: TableColumn<Row>[] = [
  { key: "name", label: "Idea / Project", width: 2, get: (r) => r.name },
  { key: "stage", label: "Stage", get: (r) => r.stage },
  { key: "priority", label: "Priority", get: (r) => r.priority },
  { key: "sponsor", label: "Sponsor", get: (r) => r.sponsor ?? "—" },
  { key: "budget", label: "Est. Budget", align: "right", get: (r) => `$${(r.budgetPlanned ?? 0).toLocaleString()}` },
];

export async function POST() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const all = await getAllProjectsWithMetrics(user);
  const rows = all
    .filter((p) => IDEATION_STAGES.includes(p.stage))
    .sort((a, b) => IDEATION_STAGES.indexOf(a.stage) - IDEATION_STAGES.indexOf(b.stage));
  const generatedAt = new Date();
  const buffer = await generateTablePdf("Ideation", `${rows.length} ideas in progress`, columns, rows, generatedAt);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ideation.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
