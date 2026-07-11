import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { requireInternal } from "@/lib/tenancy";
import { generateTablePdf, type TableColumn } from "@/lib/tableExport";

type Row = typeof resources.$inferSelect;

const columns: TableColumn<Row>[] = [
  { key: "name", label: "Name", width: 1.4, get: (r) => r.name },
  { key: "role", label: "Role", width: 1.4, get: (r) => r.role ?? "—" },
  { key: "skills", label: "Skills", width: 1.8, get: (r) => (r.skills ?? []).join(", ") || "—" },
  { key: "experience", label: "Experience", align: "right", get: (r) => (r.experienceYears ? `${r.experienceYears} yrs` : "—") },
  { key: "capacity", label: "Capacity", align: "right", get: (r) => `${r.capacityHoursPerWk ?? "—"} hrs/wk` },
  { key: "rate", label: "Rate", align: "right", get: (r) => `$${r.costPerHour ?? 0}/hr` },
];

// Internal-only, same as the Resources page and its API — a client's roster/rates never
// belong in an export they could receive.
export async function POST() {
  const user = await requireInternal("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(resources);
  const generatedAt = new Date();
  const buffer = await generateTablePdf("Resources", `${rows.length} team members`, columns, rows, generatedAt);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="resources.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
