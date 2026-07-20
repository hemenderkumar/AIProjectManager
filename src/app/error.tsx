"use client";
import { useEffect } from "react";
import { Compass, AlertTriangle, RotateCw } from "lucide-react";

// Root-segment boundary: catches anything the (app)/error.tsx above doesn't, most notably a
// crash in (app)/layout.tsx itself (e.g. getCurrentUser()) or in a page outside the
// authenticated area (login, register, the public marketing pages). No AppShell/sidebar is
// available here since the layout that renders it may be exactly what failed, so this is a
// standalone, full-page fallback.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[root error boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-slate-50">
      <div className="max-w-md text-center">
        <div className="flex items-center justify-center gap-2 mb-6 text-slate-900">
          <Compass size={22} />
          <span className="font-semibold text-lg">Keel</span>
        </div>
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
          <AlertTriangle size={22} className="text-rose-600" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900 mb-1.5">Something went wrong</h1>
        <p className="text-sm text-slate-500 mb-5">
          This is usually temporary — often a brief hiccup reaching the database under load. Try again in a
          moment.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-700 text-sm font-medium"
        >
          <RotateCw size={14} /> Try again
        </button>
      </div>
    </div>
  );
}
