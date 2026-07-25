// Executa and ProjectRequesta share one Next.js deployment and one login, but on their two
// dedicated custom domains -- executa.<domain> and projectrequesta.<domain> -- each must look
// and behave like a genuinely separate site: no visible link into the other product, and no
// reachable route into it either, even by typing the URL directly.
//
// Every other host (the legacy keel.<domain> domain, Vercel preview/production URLs,
// localhost) is deliberately left alone here and keeps the original combined /home
// experience -- this only locks down the two dedicated production domains, so existing
// bookmarks, webhooks, SSO callbacks, and local dev are unaffected.
export type ProductLock = "executa" | "projectrequesta" | null;

export function getProductLock(host: string | null | undefined): ProductLock {
  const h = (host ?? "").toLowerCase();
  if (h === "projectrequesta" || h.startsWith("projectrequesta.")) return "projectrequesta";
  if (h === "executa" || h.startsWith("executa.")) return "executa";
  return null;
}

// Top-level route prefixes that belong to Executa only. Everything under /projectrequesta/**
// is ProjectRequesta's own tree (already namespaced), so it needs no separate list.
export const EXECUTA_ONLY_PREFIXES = [
  "/home",
  "/dashboard",
  "/how-it-works",
  "/ideation",
  "/execution",
  "/support",
  "/projects",
  "/ai",
  "/reports",
  "/resources",
  "/organization",
  "/vendor-evaluation",
  "/vendors",
  "/admin",
];

export function isExecutaOnlyPath(pathname: string): boolean {
  return EXECUTA_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
