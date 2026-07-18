import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliverables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { isDownloadBlocked } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4MB original file

async function loadDeliverable(id: string) {
  const [d] = await db.select().from(deliverables).where(eq(deliverables.id, id));
  return d ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadDeliverable(id);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("VIEWER", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }
  if (!d.signedDocumentData) return NextResponse.json({ error: "No signed copy attached" }, { status: 404 });

  const buffer = Buffer.from(d.signedDocumentData, "base64");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${d.signedDocumentFilename || "signed-deliverable.pdf"}"`,
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadDeliverable(id);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("CONTRIBUTOR", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const filename: string | undefined = body.filename;
  let dataBase64: string | undefined = body.dataBase64;
  if (!filename?.trim() || !dataBase64) {
    return NextResponse.json({ error: "filename and dataBase64 are required" }, { status: 400 });
  }
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files can be attached as the signed copy." }, { status: 400 });
  }
  dataBase64 = dataBase64.replace(/^data:application\/pdf;base64,/, "");
  const approxBytes = Math.ceil((dataBase64.length * 3) / 4);
  if (approxBytes > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "That file is too large — the signed copy must be under 4MB." }, { status: 400 });
  }

  const [updated] = await db
    .update(deliverables)
    .set({
      signedDocumentFilename: filename,
      signedDocumentData: dataBase64,
      signedDocumentUploadedAt: new Date(),
      signedDocumentUploadedBy: user.name,
      updatedAt: new Date(),
    })
    .where(eq(deliverables.id, id))
    .returning({ id: deliverables.id, signedDocumentFilename: deliverables.signedDocumentFilename, signedDocumentUploadedAt: deliverables.signedDocumentUploadedAt, signedDocumentUploadedBy: deliverables.signedDocumentUploadedBy });

  await logAudit({
    actor: user, action: "deliverable.signed_document_uploaded", entityType: "deliverable", entityId: id,
    detail: `${user.name} attached the signed copy "${filename}" to deliverable "${d.title}".`,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadDeliverable(id);
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("CONTRIBUTOR", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db
    .update(deliverables)
    .set({ signedDocumentFilename: null, signedDocumentData: null, signedDocumentUploadedAt: null, signedDocumentUploadedBy: null, updatedAt: new Date() })
    .where(eq(deliverables.id, id));

  await logAudit({
    actor: user, action: "deliverable.signed_document_removed", entityType: "deliverable", entityId: id,
    detail: `${user.name} removed the signed copy from deliverable "${d.title}".`,
  });

  return NextResponse.json({ ok: true });
}
