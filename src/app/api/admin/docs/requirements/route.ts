import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildSectionedDocx, docxHeaders, type DocMeta } from "@/lib/docxExport";
import { REQUIREMENTS_SECTIONS, APP_DOC_VERSION, APP_DOC_DATE } from "@/lib/appDocs";

// ADMIN-only. Generates the whole-application Requirements Specification on demand from
// the static content in src/lib/appDocs.ts, through the same formal Keel template every
// other export in this app uses — cover page, TOC, revision history, running header/footer.
export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const meta: DocMeta = {
    documentType: "Requirements Specification",
    projectName: "Keel",
    companyName: null,
    status: "CURRENT",
    createdAt: APP_DOC_DATE,
    updatedAt: APP_DOC_DATE,
  };

  const buffer = await buildSectionedDocx(
    "Requirements Specification",
    `Whole-Application Reference — v${APP_DOC_VERSION}`,
    REQUIREMENTS_SECTIONS,
    meta
  );
  return new NextResponse(new Uint8Array(buffer), { headers: docxHeaders("keel-requirements-specification.docx") });
}
