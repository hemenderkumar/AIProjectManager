import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoices, costItems, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { isDownloadBlocked } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Escapes a single CSV field: wraps in quotes (doubling any internal quotes) whenever the
// value contains a comma, quote, or newline -- the minimum RFC 4180 needs, and enough for
// every field this export produces (names, notes, currency strings).
function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsvRow(fields: (string | number)[]): string {
  return fields.map(csvField).join(",");
}

// A generic ledger CSV -- not a live QuickBooks/Xero API integration, which would need the
// user's own OAuth app credentials for either service (out of scope for this app to set up on
// their behalf). Both QuickBooks Online ("Upload from file" under Banking) and Xero
// ("Import a statement") accept a generic CSV like this and let the bookkeeper map columns
// once during import, so this covers the same need -- getting invoice/cost data out of Executa
// and into the org's actual books -- without depending on either vendor's API surface.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }

  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [projectInvoices, projectCostItems] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.projectId, id)),
    db.select().from(costItems).where(eq(costItems.projectId, id)),
  ]);

  const rows: string[] = [
    toCsvRow(["Date", "Type", "Reference", "Payee / Description", "Category", "Amount", "Status", "Notes"]),
  ];

  for (const inv of projectInvoices) {
    rows.push(
      toCsvRow([
        inv.invoiceDate ? inv.invoiceDate.toISOString().slice(0, 10) : "",
        "Invoice",
        inv.invoiceNumber ?? "",
        inv.vendor,
        "Vendor / Contractor",
        inv.amount.toFixed(2),
        inv.status,
        inv.notes ?? "",
      ])
    );
  }

  for (const item of projectCostItems) {
    rows.push(
      toCsvRow([
        item.createdAt.toISOString().slice(0, 10),
        "Cost Item",
        item.id,
        item.name,
        item.category,
        item.amount.toFixed(2),
        item.isRecurring ? `Recurring${item.cadence ? ` (${item.cadence})` : ""}` : "One-time",
        item.notes ?? "",
      ])
    );
  }

  await logAudit({
    actor: user,
    action: "project.accounting_export",
    entityType: "project",
    entityId: id,
    detail: `${user.name} exported ${projectInvoices.length} invoice(s) and ${projectCostItems.length} cost item(s) from "${project.name}" as a ledger CSV.`,
  });

  const filename = `${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ledger-export.csv`;
  return new NextResponse(rows.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
