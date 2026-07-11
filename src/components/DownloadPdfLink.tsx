"use client";
import { useState } from "react";
import { Download, Loader2, AlertTriangle } from "lucide-react";

/** A "Download PDF" control that fetches + downloads via blob instead of a plain <a href>
 * link — a raw link to a failing API route leaves the user staring at a bare error page
 * (or, worse, nothing visibly different at all) with no way to tell what went wrong. This
 * surfaces the real error inline instead. Used anywhere a document (charter, RFP) can be
 * downloaded as a formatted PDF. */
export default function DownloadPdfLink({
  href,
  filename,
  label = "Download PDF",
  className,
}: {
  href: string;
  filename: string;
  label?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        let message = `Couldn't generate this PDF (server returned ${res.status}).`;
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // not a JSON error body — keep the generic message
        }
        setError(message);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't reach the server to generate this PDF. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        onClick={download}
        disabled={loading}
        className={
          className ??
          "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        }
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        {label}
      </button>
      {error && (
        <p className="flex items-start gap-1 text-xs text-rose-600 max-w-xs">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {error}
        </p>
      )}
    </div>
  );
}
