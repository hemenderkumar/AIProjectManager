import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildOrganizationExport } from "@/lib/orgExport";
import { logAudit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const data = await buildOrganizationExport(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logAudit({
    actor: admin,
    action: "organization.data_exported",
    entityType: "organization",
    entityId: id,
    organizationId: id,
    detail: `${admin.name} (admin) exported "${data.organization.name}"'s data.`,
  });

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${data.organization.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-export.json"`,
    },
  });
}
