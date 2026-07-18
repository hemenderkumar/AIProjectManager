import { NextResponse } from "next/server";
import { requireRole, isDownloadBlocked } from "@/lib/auth";
import { buildOrganizationExport } from "@/lib/orgExport";
import { logAudit } from "@/lib/audit";

// Self-service data export: a SUPER_USER can download everything tied to their own
// organization as JSON — every project, task, status update, incident, etc. Read-only,
// no confirmation needed (unlike deletion).
export async function GET() {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }

  const data = await buildOrganizationExport(user.organizationId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logAudit({
    actor: user,
    action: "organization.data_exported",
    entityType: "organization",
    entityId: user.organizationId,
    organizationId: user.organizationId,
    detail: `${user.name} exported their organization's data.`,
  });

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${data.organization.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-export.json"`,
    },
  });
}
