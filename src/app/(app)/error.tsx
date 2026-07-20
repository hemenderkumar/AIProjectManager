"use client";
import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

// Catches a render-time crash in any authenticated page (Ideation, Dashboard, a project's
// tabs, etc.) without taking down the sidebar/nav around it -- AppShell lives in this
// segment's layout.tsx, which is a parent of this boundary, so it keeps rendering normally.
// The most common cause seen so far is a transient DB error (e.g. the connection pool
// being briefly exhausted under a burst of traffic) -- "Try again" simply re-renders the
// segment, which is usually enough since these are not persistent failures.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[70vh] px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
          <AlertTriangle size={22} className="text-rose-600" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900 mb-1.5">Something went wrong loading this page</h1>
        <p className="text-sm text-slate-500 mb-5">
          This is usually temporary — often a brief hiccup reaching the database under load. Try again in a
          moment; if it keeps happening, let us know via the issue reporter in the corner.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700 text-sm font-medium"
        >
          <RotateCw size={14} /> Try again
        </button>
      </div>
    </div>
  );
}
