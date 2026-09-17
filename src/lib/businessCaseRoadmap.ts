// Some older Business Case roadmaps were captured as a full standalone HTML timeline document (an
// AI-drafted visualization someone pasted into the plain-text Roadmap field) rather than plain
// step text. Rendered naively -- split on newline, numbered -- that dumps raw markup as a garbled
// numbered list ("1. <!DOCTYPE html>", "2. <html>", ...). This detects that shape and pulls the
// real milestone text back out of the .year-label / .quarter-label / .milestone divs, grouped by
// year and quarter, so the content people actually wrote is still shown -- just as clean text
// instead of markup. Shared by the on-screen preview (BusinessCasePreview.tsx) and the PPTX export
// (businessCaseExport.ts) so both render identically. Plain, already-clean roadmap text (numbered
// or bulleted lines) is unaffected and goes through the original line-splitting path.
export function extractRoadmapSteps(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const trimmed = text.trim();
  const looksLikeHtmlDoc = /^<!DOCTYPE html>/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
  if (looksLikeHtmlDoc) {
    const extracted = extractFromHtmlTimeline(trimmed);
    if (extracted.length) return extracted;
    // Fell back: markup we don't recognize the shape of. Don't dump raw HTML as list items.
    return [];
  }
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

function extractFromHtmlTimeline(html: string): string[] {
  const tagRe = /<div class="(year-label|quarter-label|milestone(?:\s+[\w-]+)?)">([^<]*)<\/div>/gi;
  let year = "";
  let quarter = "";
  const order: string[] = [];
  const groups = new Map<string, string[]>();
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html))) {
    const cls = match[1];
    const text = match[2].replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (cls === "year-label") {
      year = text;
      continue;
    }
    if (cls === "quarter-label") {
      quarter = text;
      continue;
    }
    const key = [year, quarter].filter(Boolean).join(" — ");
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(text);
  }
  return order.map((key) => (key ? `${key}: ${groups.get(key)!.join("; ")}` : groups.get(key)!.join("; ")));
}
