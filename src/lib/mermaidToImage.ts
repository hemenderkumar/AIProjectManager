// Browser-only: renders Mermaid diagram syntax to both an SVG string and a rasterized PNG
// (via an offscreen canvas), so a Word export can embed an actual picture without any
// server-side headless-browser dependency — Mermaid itself needs a DOM and can't render on
// the server (see the comment on components/MermaidDiagram.tsx). The docx package supports
// embedding an SVG image directly as long as a PNG fallback is also provided (Word's own SVG
// support is inconsistent), so we generate both here and hand them to the docx route.
export type MermaidImagePayload = {
  svgBase64: string;
  pngBase64: string;
  width: number;
  height: number;
};

export async function renderMermaidToImages(chart: string): Promise<MermaidImagePayload | null> {
  if (typeof window === "undefined" || !chart?.trim()) return null;

  const mod = await import("mermaid");
  const mermaid = mod.default;
  mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });

  let svg: string;
  try {
    const result = await mermaid.render(`mermaid-export-${Date.now()}`, chart);
    svg = result.svg;
  } catch {
    return null;
  }

  // Pull dimensions from the rendered SVG's viewBox so the embedded image keeps its aspect
  // ratio instead of being squashed into an arbitrary fixed box.
  let width = 800;
  let height = 500;
  const viewBoxMatch = svg.match(/viewBox="([\d.\s-]+)"/);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      width = parts[2];
      height = parts[3];
    }
  }
  const maxWidth = 900;
  if (width > maxWidth) {
    height = Math.round((height / width) * maxWidth);
    width = maxWidth;
  }

  const svgBase64 = btoa(unescape(encodeURIComponent(svg)));

  const pngBase64: string | null = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width * 2; // 2x for a crisper embedded image
        canvas.height = height * 2;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png").split(",")[1] ?? null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;base64,${svgBase64}`;
  });

  if (!pngBase64) return null;
  return { svgBase64, pngBase64, width, height };
}
