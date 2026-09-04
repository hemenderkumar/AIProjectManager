import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { riskItems, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { dispatchWebhook } from "@/lib/webhooks";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("VIEWER", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await db.select().from(riskItems).where(eq(riskItems.projectId, id));
  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(riskItems)
    .values({
      projectId: id,
      description: body.description,
      impact: body.impact ?? "MEDIUM",
      likelihood: body.likelihood ?? "MEDIUM",
      mitigation: body.mitigation ?? null,
      owner: body.owner ?? null,
      status: body.status ?? "OPEN",
    })
    .returning();

  const [project] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, id));
  await dispatchWebhook(project?.organizationId ?? null, "RISK_CREATED", {
    id: created.id, description: created.description, impact: created.impact, likelihood: created.likelihood, projectId: created.projectId,
  });

  return NextResponse.json(created, { status: 201 });
}
