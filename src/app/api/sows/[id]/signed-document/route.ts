import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { isDownloadBlocked } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// The signed/executed contract, attached as a PDF. Stored inline as base64 (no external blob
// storage to provision) — see the schema comment on sows.signedDocumentData. Capped well under
// Vercel's serverless request body limit so uploads fail with a clear error instead of a
// cryptic 413.
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4MB original file (base64 in the request body is larger)

async function loadSow(id: string) {
  const [sow] = await db.select().from(sows).where(eq(sows.id, id));
  return sow ?? null;
}

// Serves the stored PDF for download/preview.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sow = await loadSow(id);
  if (!sow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("VIEWER", sow.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await isDownloadBlocked(user.id)) {
    return NextResponse.json(
      { error: "Your account is pending admin approval. Downloads unlock once an admin confirms your registration." },
      { status: 403 }
    );
  }
  if (!sow.signedDocumentData) return NextResponse.json({ error: "No signed copy attached" }, { status: 404 });

  const buffer = Buffer.from(sow.signedDocumentData, "base64");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sow.signedDocumentFilename || "signed-sow.pdf"}"`,
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sow = await loadSow(id);
  if (!sow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("SUPER_USER", sow.projectId);
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
  // Strip a data: URL prefix if the client sent one (e.g. "data:application/pdf;base64,...").
  dataBase64 = dataBase64.replace(/^data:application\/pdf;base64,/, "");
  const approxBytes = Math.ceil((dataBase64.length * 3) / 4);
  if (approxBytes > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "That file is too large — the signed copy must be under 4MB." }, { status: 400 });
  }

  const [updated] = await db
    .update(sows)
    .set({
      signedDocumentFilename: filename,
      signedDocumentData: dataBase64,
      signedDocumentUploadedAt: new Date(),
      signedDocumentUploadedBy: user.name,
      updatedAt: new Date(),
    })
    .where(eq(sows.id, id))
    .returning({ id: sows.id, signedDocumentFilename: sows.signedDocumentFilename, signedDocumentUploadedAt: sows.signedDocumentUploadedAt, signedDocumentUploadedBy: sows.signedDocumentUploadedBy });

  await logAudit({
    actor: user, action: "sow.signed_document_uploaded", entityType: "sow", entityId: id,
    detail: `${user.name} attached the signed copy "${filename}" to SOW "${sow.title}".`,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sow = await loadSow(id);
  if (!sow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("SUPER_USER", sow.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db
    .update(sows)
    .set({ signedDocumentFilename: null, signedDocumentData: null, signedDocumentUploadedAt: null, signedDocumentUploadedBy: null, updatedAt: new Date() })
    .where(eq(sows.id, id));

  await logAudit({
    actor: user, action: "sow.signed_document_removed", entityType: "sow", entityId: id,
    detail: `${user.name} removed the signed copy from SOW "${sow.title}".`,
  });

  return NextResponse.json({ ok: true });
}
