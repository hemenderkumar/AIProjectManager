"use client";
import { useEffect } from "react";
import "./globals.css";

// Last-resort boundary: only fires if the ROOT layout.tsx itself throws while rendering
// (e.g. a future change that adds another unguarded DB call there, the way getCurrentTheme()
// used to before it got a try/catch). Next.js requires this file to render its own <html>
// and <body> since it replaces the entire root layout when it activates. Deliberately plain
// -- no icons, no CSS variables that might depend on something that could itself be part of
// what's broken -- just enough to tell the person what happened and let them retry.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", background: "#f8fafc", margin: 0 }}>
        <div style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
          <p style={{ fontWeight: 600, fontSize: 18, color: "#0f172a", marginBottom: 8 }}>Keel</p>
          <h1 style={{ fontSize: 17, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 20, lineHeight: 1.5 }}>
            This is usually temporary — often a brief hiccup reaching the database under load. Try again in a
            moment.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              background: "#4f46e5",
              color: "#fff",
              border: "none",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
