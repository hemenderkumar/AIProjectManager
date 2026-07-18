"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, X, Camera, Loader2, Check } from "lucide-react";

const PANEL_ID = "keel-issue-reporter-panel";

// Floating "Report an issue" widget, available on every page (mounted once in AppShell,
// same as the AI PM avatar). Deliberately bottom-LEFT — the avatar already owns bottom-right,
// and the two would otherwise overlap. Clicking it immediately captures a screenshot of the
// current page client-side via html2canvas (a DOM screenshot of what's visible in the
// browser, not a native OS/screen capture — no permission prompt needed), so the reporter
// only has to type what went wrong. The screenshot excludes this panel itself via
// ignoreElements, so it shows the underlying page, not our own form.
export default function IssueReporter() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openAndCapture() {
    setOpen(true);
    setCapturing(true);
    setCaptureFailed(false);
    setScreenshot(null);
    setDone(false);
    setError(null);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(document.body, {
        // Skip our own floating panel so the capture shows the page underneath it, not
        // the report form itself.
        ignoreElements: (el) => el.id === PANEL_ID,
        useCORS: true,
        logging: false,
        scale: Math.min(window.devicePixelRatio || 1, 1.5),
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
      });
      // JPEG at moderate quality keeps this well under Vercel's request-body limit —
      // a full-page PNG at device pixel ratio can run several MB.
      setScreenshot(canvas.toDataURL("image/jpeg", 0.6));
    } catch (err) {
      console.error("screenshot capture failed:", err);
      setCaptureFailed(true);
    } finally {
      setCapturing(false);
    }
  }

  function close() {
    setOpen(false);
    setDescription("");
    setScreenshot(null);
    setCaptureFailed(false);
    setDone(false);
    setError(null);
  }

  async function submit() {
    if (!description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pagePath: pathname,
          description,
          screenshotDataUrl: screenshot,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Could not submit your report.");
        return;
      }
      setDone(true);
      setTimeout(close, 1800);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={openAndCapture}
        className="fixed bottom-5 left-5 h-12 w-12 rounded-full bg-white border border-slate-200 shadow-lg flex items-center justify-center hover:scale-105 transition-transform z-50 text-slate-500 hover:text-rose-600"
        aria-label="Report an issue"
        title="Report an issue"
      >
        <Bug size={19} />
      </button>
    );
  }

  return (
    <div
      id={PANEL_ID}
      className="fixed bottom-5 left-5 w-80 bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 shadow-xl z-50 flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          <Bug size={15} className="text-rose-500" /> Report an issue
        </p>
        <button onClick={close} className="text-slate-400 hover:text-slate-700 p-1" aria-label="Close">
          <X size={15} />
        </button>
      </div>

      {done ? (
        <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
          <div className="h-9 w-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Check size={18} />
          </div>
          <p className="text-sm font-medium text-slate-800">Thanks — your report was sent.</p>
        </div>
      ) : (
        <>
          <div className="px-4 pt-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden h-32 flex items-center justify-center">
              {capturing ? (
                <div className="flex flex-col items-center gap-1.5 text-slate-400">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-xs">Capturing screenshot...</span>
                </div>
              ) : screenshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={screenshot} alt="Captured screenshot preview" className="h-full w-full object-cover object-top" />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-slate-400">
                  <Camera size={18} />
                  <span className="text-xs">{captureFailed ? "Couldn't capture a screenshot — your report will still be sent." : "No screenshot"}</span>
                </div>
              )}
            </div>
          </div>

          <div className="px-4 pt-3 pb-1">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What went wrong, or what would you like to see changed?"
              rows={3}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500 resize-none"
            />
          </div>

          {error && <p className="px-4 text-xs text-rose-600">{error}</p>}

          <div className="px-4 pb-4 pt-2 flex justify-end">
            <button
              onClick={submit}
              disabled={submitting || capturing || !description.trim()}
              className="px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send report"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
