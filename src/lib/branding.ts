import { eq } from "drizzle-orm";
import { db } from "./db";
import { organizations } from "./db/schema";

// ---- Validation (pure, unit-tested) -----------------------------------------------------

const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "login", "logout", "register", "portal", "www", "executa", "support",
  "billing", "settings", "static", "public", "help", "status",
]);
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
// Header-injection / display-name safety: no angle brackets, quotes, or control chars.
const SAFE_NAME_RE = /^[^<>"\r\n\t]+$/;

export type WhiteLabelFields = {
  brandDisplayName?: string | null;
  loginSlug?: string | null;
  loginTagline?: string | null;
  hidePoweredBy?: boolean;
  emailFromName?: string | null;
  emailReplyTo?: string | null;
};

export type WhiteLabelResult = { ok: true; updates: WhiteLabelFields } | { ok: false; error: string };

function optionalText(
  body: Record<string, unknown>,
  key: string,
  max: number,
  label: string,
  safe = false,
): { skip: true } | { skip: false; value: string | null } | { error: string } {
  if (!(key in body)) return { skip: true };
  const v = body[key];
  if (v === null || v === "") return { skip: false, value: null };
  if (typeof v !== "string") return { error: `${label} must be text` };
  const t = v.trim();
  if (t.length > max) return { error: `${label} must be ${max} characters or fewer` };
  if (safe && !SAFE_NAME_RE.test(t)) return { error: `${label} contains characters that aren't allowed` };
  return { skip: false, value: t || null };
}

export function validateWhiteLabel(body: Record<string, unknown>): WhiteLabelResult {
  const updates: WhiteLabelFields = {};

  const name = optionalText(body, "brandDisplayName", 60, "Display name", true);
  if ("error" in name) return { ok: false, error: name.error };
  if (!name.skip) updates.brandDisplayName = name.value;

  const tagline = optionalText(body, "loginTagline", 120, "Tagline");
  if ("error" in tagline) return { ok: false, error: tagline.error };
  if (!tagline.skip) updates.loginTagline = tagline.value;

  const fromName = optionalText(body, "emailFromName", 60, "Email sender name", true);
  if ("error" in fromName) return { ok: false, error: fromName.error };
  if (!fromName.skip) updates.emailFromName = fromName.value;

  if ("loginSlug" in body) {
    const v = body.loginSlug;
    if (v === null || v === "") updates.loginSlug = null;
    else if (typeof v !== "string") return { ok: false, error: "Login address must be text" };
    else {
      const s = v.trim().toLowerCase();
      if (!SLUG_RE.test(s)) {
        return { ok: false, error: "Login address must be 3–40 characters: lowercase letters, numbers and hyphens" };
      }
      if (RESERVED_SLUGS.has(s)) return { ok: false, error: "That login address is reserved — please pick another" };
      updates.loginSlug = s;
    }
  }

  if ("emailReplyTo" in body) {
    const v = body.emailReplyTo;
    if (v === null || v === "") updates.emailReplyTo = null;
    else if (typeof v === "string" && EMAIL_RE.test(v.trim()) && v.length <= 200) updates.emailReplyTo = v.trim();
    else return { ok: false, error: "Reply-to must be a valid email address" };
  }

  if ("hidePoweredBy" in body) {
    if (typeof body.hidePoweredBy !== "boolean") return { ok: false, error: "hidePoweredBy must be true or false" };
    updates.hidePoweredBy = body.hidePoweredBy;
  }

  return { ok: true, updates };
}

// ---- Email helpers ----------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type PublicBranding = {
  name: string;
  logoDataUrl: string | null;
  brandColor: string | null;
  tagline: string | null;
  hidePoweredBy: boolean;
};

export function renderBrandedEmailHtml(opts: {
  branding: Pick<PublicBranding, "name" | "brandColor" | "hidePoweredBy">;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
}): string {
  const color = opts.branding.brandColor && /^#[0-9a-fA-F]{6}$/.test(opts.branding.brandColor) ? opts.branding.brandColor : "#4f46e5";
  const paras = opts.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#334155">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const cta =
    opts.cta && /^https?:\/\//.test(opts.cta.url)
      ? `<p style="margin:20px 0"><a href="${escapeHtml(opts.cta.url)}" style="background:${color};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block">${escapeHtml(opts.cta.label)}</a></p>`
      : "";
  const footer = opts.branding.hidePoweredBy
    ? ""
    : `<p style="margin:24px 0 0;font-size:11px;color:#94a3b8">Powered by Executa</p>`;
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><div style="background:${color};color:#fff;padding:14px 20px;font-size:15px;font-weight:600">${escapeHtml(opts.branding.name)}</div><div style="padding:22px 20px"><h1 style="margin:0 0 14px;font-size:18px;color:#0f172a">${escapeHtml(opts.heading)}</h1>${paras}${cta}${footer}</div></div></div></body></html>`;
}

// ---- Lookups ----------------------------------------------------------------------------

function toPublic(org: typeof organizations.$inferSelect): PublicBranding {
  return {
    name: org.brandDisplayName?.trim() || org.name,
    logoDataUrl: org.logoDataUrl,
    brandColor: org.brandColor,
    tagline: org.loginTagline,
    hidePoweredBy: org.hidePoweredBy,
  };
}

// Unauthenticated: only fields safe to show on a sign-in page.
export async function getPublicBrandingBySlug(slug: string): Promise<PublicBranding | null> {
  const s = slug.trim().toLowerCase();
  if (!SLUG_RE.test(s)) return null;
  const [org] = await db.select().from(organizations).where(eq(organizations.loginSlug, s));
  if (!org || !org.isActive) return null;
  return toPublic(org);
}

export async function getBrandingForOrg(organizationId: string | null | undefined): Promise<PublicBranding | null> {
  if (!organizationId) return null;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  return org ? toPublic(org) : null;
}

export async function getEmailSettingsForOrg(organizationId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) return null;
  return { branding: toPublic(org), fromName: org.emailFromName, replyTo: org.emailReplyTo };
}
