import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildSectionedDocx, docxHeaders, type DocMeta } from "@/lib/docxExport";
import { DESIGN_SECTIONS, APP_DOC_VERSION, APP_DOC_DATE } from "@/lib/appDocs";

// ADMIN-only. Generates the whole-application Design Document on demand — same static
// content + formal-template pattern as the Requirements Specification route.
export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const meta: DocMeta = {
    documentType: "Design Document",
    projectName: "Keel",
    companyName: null,
    status: "CURRENT",
    createdAt: APP_DOC_DATE,
    updatedAt: APP_DOC_DATE,
  };

  const buffer = await buildSectionedDocx(
    "Design Document",
    `Architecture & Design Reference — v${APP_DOC_VERSION}`,
    DESIGN_SECTIONS,
    meta
  );
  return new NextResponse(new Uint8Array(buffer), { headers: docxHeaders("keel-design-document.docx") });
}
