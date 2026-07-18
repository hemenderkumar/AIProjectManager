import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildSectionedDocx, docxHeaders, type DocMeta } from "@/lib/docxExport";
import { TRAINING_SECTIONS, APP_DOC_VERSION, APP_DOC_DATE } from "@/lib/appDocs";

// ADMIN-only. Generates the whole-application Training Manual on demand — same static
// content + formal-template pattern as the other two reference documents.
export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const meta: DocMeta = {
    documentType: "Training Manual",
    projectName: "Keel",
    companyName: null,
    status: "CURRENT",
    createdAt: APP_DOC_DATE,
    updatedAt: APP_DOC_DATE,
  };

  const buffer = await buildSectionedDocx(
    "Training Manual",
    `How to Use Keel — v${APP_DOC_VERSION}`,
    TRAINING_SECTIONS,
    meta
  );
  return new NextResponse(new Uint8Array(buffer), { headers: docxHeaders("keel-training-manual.docx") });
}
