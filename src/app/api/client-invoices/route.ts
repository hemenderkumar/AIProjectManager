import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientInvoices, projects } from "@/lib/db/schema";
import { getCurrentUser, roleAtLeast } from "@/lib/auth";
import { listVisibleProjects, requireProjectAccess } from "@/lib/tenancy";
import { displayStatus, nextInvoiceNumber, validateInvoiceInput } from "@/lib/clientInvoices";
import { logAudit } from "@/lib/audit";

// GET: receivables visible to the caller (same project visibility rule as everywhere else).
// DRAFTs are only shown to PM and above -- a client reviewer only ever sees SENT / PAID / VOID.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const visible = await listVisibleProjects(user);
  if (!visible.length) return NextResponse.json([]);
  const names = new Map(visible.map((p) => [p.id, p.name]));

  const rows = await db
    .select()
    .from(clientInvoices)
    .where(inArray(clientInvoices.projectId, [...names.keys()]))
    .orderBy(desc(clientInvoices.createdAt));

  const showDrafts = roleAtLeast(user.role, "PM");
  return NextResponse.json(
    rows
      .filter((r) => showDrafts || r.status !== "DRAFT")
      .map((r) => ({ ...r, projectName: names.get(r.projectId) ?? "", displayStatus: displayStatus(r) })),
  );
}

// POST: create a DRAFT receivable on a project (PM+ on that project).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const user = await requireProjectAccess("PM", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [project] = await db.select({ organizationId: projects.organizationId, name: projects.name }).from(projects).where(eq(projects.id, projectId));
  if (!project?.organizationId) {
    return NextResponse.json({ error: "Invoices can only be raised on a project that belongs to a company" }, { status: 400 });
  }

  const v = validateInvoiceInput(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const existing = await db
    .select({ number: clientInvoices.number })
    .from(clientInvoices)
    .where(eq(clientInvoices.organizationId, project.organizationId));
  const number = nextInvoiceNumber(existing.map((e) => e.number));

  const [row] = await db
    .insert(clientInvoices)
    .values({
      organizationId: project.organizationId,
      projectId,
      number,
      description: v.description,
      amountCents: v.amountCents,
      dueDate: v.dueDate,
      createdBy: user.name,
    })
    .returning();

  await logAudit({
    actor: user, action: "client_invoice.created", entityType: "client_invoice", entityId: row.id,
    detail: `${user.name} created invoice ${number} on "${project.name}".`,
  });
  return NextResponse.json(row, { status: 201 });
}
