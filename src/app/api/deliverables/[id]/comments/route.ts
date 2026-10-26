import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { deliverables, deliverableComments } from "@/lib/db/schema";
import { requireProjectAccess } from "@/lib/tenancy";
import { authorSideFor, notifyDeliveryTeam, validateAttachment } from "@/lib/deliverableReview";

async function load(id: string) {
  const [d] = await db.select().from(deliverables).where(eq(deliverables.id, id));
  return d ?? null;
}

// Thread for a deliverable. Attachment bytes are never included in the list -- only metadata;
// the file itself is fetched via the .../attachment route.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await load(id);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("VIEWER", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({
      id: deliverableComments.id,
      kind: deliverableComments.kind,
      authorName: deliverableComments.authorName,
      authorSide: deliverableComments.authorSide,
      body: deliverableComments.body,
      attachmentFilename: deliverableComments.attachmentFilename,
      attachmentMime: deliverableComments.attachmentMime,
      attachmentSize: deliverableComments.attachmentSize,
      createdAt: deliverableComments.createdAt,
    })
    .from(deliverableComments)
    .where(eq(deliverableComments.deliverableId, id))
    .orderBy(asc(deliverableComments.createdAt));
  return NextResponse.json(rows);
}

// Post a comment and/or one file. Open to every project member including client VIEWERs --
// conversation is lower stakes than sign-off.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await load(id);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("VIEWER", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length > 5000) return NextResponse.json({ error: "Comment is too long" }, { status: 400 });

  let attachment: { filename: string; mime: string; size: number; data: string } | null = null;
  if (body.attachment) {
    const v = validateAttachment(body.attachment);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    attachment = v;
  }
  if (!text && !attachment) return NextResponse.json({ error: "Write a comment or attach a file" }, { status: 400 });

  const side = authorSideFor(user);
  const [row] = await db
    .insert(deliverableComments)
    .values({
      deliverableId: id,
      kind: "COMMENT",
      authorUserId: user.id,
      authorName: user.name,
      authorSide: side,
      body: text,
      attachmentFilename: attachment?.filename ?? null,
      attachmentMime: attachment?.mime ?? null,
      attachmentSize: attachment?.size ?? null,
      attachmentData: attachment?.data ?? null,
    })
    .returning({ id: deliverableComments.id });

  // Client comments ping the delivery team. Team comments are not auto-emailed to clients
  // (the portal shows them); that avoids surprise email to external users.
  if (side === "CLIENT") {
    await notifyDeliveryTeam({
      projectId: d.projectId,
      actor: user,
      title: `New comment on ${d.title}`,
      body: text || `${user.name} attached ${attachment?.filename}.`,
    });
  }
  return NextResponse.json({ id: row.id }, { status: 201 });
}
