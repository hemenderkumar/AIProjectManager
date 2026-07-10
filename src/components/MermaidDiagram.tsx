"use client";
import { useEffect, useId, useState } from "react";

// Renders Mermaid diagram syntax as an SVG in the browser. Mermaid needs the DOM, so this
// only ever runs client-side — the raw diagram text is what gets persisted/exported, this
// component is purely a viewer on top of it.
export default function MermaidDiagram({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "-");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!chart?.trim()) {
      return;
    }
    import("mermaid").then(async (mod) => {
      const mermaid = mod.default;
      try {
        mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
        const { svg: rendered } = await mermaid.render(`mermaid-${id}`, chart);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setSvg(null);
          setError("Couldn't render this diagram — check the syntax below.");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (!chart?.trim()) {
    return <p className="text-xs text-slate-400">No architecture diagram yet.</p>;
  }

  return (
    <div>
      {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
      {svg && (
        <div className="bg-white border border-slate-100 rounded-lg p-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  );
}
