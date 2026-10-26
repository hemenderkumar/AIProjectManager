import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { deliverables, deliverableComments } from "@/lib/db/schema";
import { requireProjectAccess } from "@/lib/tenancy";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const { id, commentId } = await params;
  const [d] = await db.select({ projectId: deliverables.projectId }).from(deliverables).where(eq(deliverables.id, id));
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("VIEWER", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [c] = await db
    .select()
    .from(deliverableComments)
    .where(and(eq(deliverableComments.id, commentId), eq(deliverableComments.deliverableId, id)));
  if (!c || !c.attachmentData) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bytes = Buffer.from(c.attachmentData, "base64");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": c.attachmentMime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${(c.attachmentFilename || "file").replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
