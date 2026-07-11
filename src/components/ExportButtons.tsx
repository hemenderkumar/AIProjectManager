"use client";
import { useState } from "react";
import { FileDown, Presentation, Loader2 } from "lucide-react";

/** Generic "Export PDF / Export PPTX" button pair, pointed at a `/api/reports/<x>/pdf`
 * + `/api/reports/<x>/pptx` route pair. Used on every list-style screen so each page
 * doesn't need its own bespoke download logic. */
export default function ExportButtons({
  endpoint,
  filenamePrefix,
  pdfLabel = "Export PDF",
  pptxLabel = "Export PPTX",
}: {
  endpoint: string; // e.g. "/api/reports/projects"
  filenamePrefix: string; // e.g. "projects"
  pdfLabel?: string;
  pptxLabel?: string;
}) {
  const [exporting, setExporting] = useState<"pdf" | "pptx" | null>(null);

  async function exportFile(format: "pdf" | "pptx") {
    setExporting(format);
    try {
      const res = await fetch(`${endpoint}/${format}`, { method: "POST" });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenamePrefix}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => exportFile("pdf")}
        disabled={exporting === "pdf"}
        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {exporting === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
        {pdfLabel}
      </button>
      <button
        onClick={() => exportFile("pptx")}
        disabled={exporting === "pptx"}
        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {exporting === "pptx" ? <Loader2 size={14} className="animate-spin" /> : <Presentation size={14} />}
        {pptxLabel}
      </button>
    </div>
  );
}
