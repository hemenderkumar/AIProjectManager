import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { requireInternal } from "@/lib/tenancy";
import { generateTablePptx, type TableColumn } from "@/lib/tableExport";

type Row = typeof resources.$inferSelect;

const columns: TableColumn<Row>[] = [
  { key: "name", label: "Name", width: 1.4, get: (r) => r.name },
  { key: "role", label: "Role", width: 1.4, get: (r) => r.role ?? "—" },
  { key: "skills", label: "Skills", width: 1.8, get: (r) => (r.skills ?? []).join(", ") || "—" },
  { key: "experience", label: "Experience", align: "right", get: (r) => (r.experienceYears ? `${r.experienceYears} yrs` : "—") },
  { key: "capacity", label: "Capacity", align: "right", get: (r) => `${r.capacityHoursPerWk ?? "—"} hrs/wk` },
  { key: "rate", label: "Rate", align: "right", get: (r) => `$${r.costPerHour ?? 0}/hr` },
];

export async function POST() {
  const user = await requireInternal("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(resources);
  const generatedAt = new Date();
  const buffer = await generateTablePptx("Resources", `${rows.length} team members`, columns, rows, generatedAt);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="resources.pptx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
