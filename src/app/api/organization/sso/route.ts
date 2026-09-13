import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ssoConfigurations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { spEntityId, acsUrl } from "@/lib/sso";

const ASSIGNABLE_DEFAULT_ROLES = ["VIEWER", "CONTRIBUTOR", "PM"] as const;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

// Self-service: a SUPER_USER configuring their own organization's SAML IdP. Same "own org
// only" shape as /api/organization -- no cross-org browsing here, that's ADMIN-only tooling.
export async function GET() {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [config] = await db.select().from(ssoConfigurations).where(eq(ssoConfigurations.organizationId, user.organizationId));
  return NextResponse.json({
    config: config ?? null,
    // The two URLs an org's IT admin needs to paste into their IdP -- computed, not stored,
    // so they always reflect the current NEXT_PUBLIC_APP_URL even if that ever changes.
    spEntityId: spEntityId(user.organizationId),
    acsUrl: acsUrl(user.organizationId),
  });
}

export async function PUT(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const emailDomain = String(body?.emailDomain ?? "").trim().toLowerCase();
  const idpEntityId = String(body?.idpEntityId ?? "").trim();
  const idpSsoUrl = String(body?.idpSsoUrl ?? "").trim();
  const idpCertificate = String(body?.idpCertificate ?? "").trim();
  const defaultRole = ASSIGNABLE_DEFAULT_ROLES.includes(body?.defaultRole)
    ? body.defaultRole
    : "VIEWER";
  const isEnabled = Boolean(body?.isEnabled);

  if (!DOMAIN_RE.test(emailDomain)) {
    return NextResponse.json({ error: "Enter a valid domain, e.g. acme.com" }, { status: 400 });
  }
  if (!idpEntityId) return NextResponse.json({ error: "Identity Provider Entity ID is required" }, { status: 400 });
  let ssoUrlValid = false;
  try {
    const parsed = new URL(idpSsoUrl);
    ssoUrlValid = parsed.protocol === "https:";
  } catch {
    ssoUrlValid = false;
  }
  if (!ssoUrlValid) return NextResponse.json({ error: "Identity Provider SSO URL must be a valid https:// URL" }, { status: 400 });
  if (!idpCertificate.includes("BEGIN CERTIFICATE")) {
    return NextResponse.json({ error: "Certificate must be a PEM-encoded X.509 certificate (-----BEGIN CERTIFICATE-----...)" }, { status: 400 });
  }

  const values = { emailDomain, idpEntityId, idpSsoUrl, idpCertificate, defaultRole, isEnabled, updatedAt: new Date() };

  try {
    const [existing] = await db.select({ id: ssoConfigurations.id }).from(ssoConfigurations).where(eq(ssoConfigurations.organizationId, user.organizationId));
    if (existing) {
      await db.update(ssoConfigurations).set(values).where(eq(ssoConfigurations.id, existing.id));
    } else {
      await db.insert(ssoConfigurations).values({ ...values, organizationId: user.organizationId, createdBy: user.name });
    }
  } catch (err) {
    // Postgres unique-violation (23505) on email_domain -- most likely cause: another
    // organization already registered this exact domain.
    if ((err as { code?: string })?.code === "23505") {
      return NextResponse.json({ error: "This email domain is already configured for SSO by another organization." }, { status: 409 });
    }
    console.error("Failed to save SSO configuration:", err);
    return NextResponse.json({ error: "Could not save SSO configuration." }, { status: 500 });
  }

  await logAudit({
    actor: user,
    action: "sso_configuration.saved",
    entityType: "sso_configuration",
    organizationId: user.organizationId,
    detail: `${user.name} ${isEnabled ? "enabled" : "saved (disabled)"} SSO for domain ${emailDomain}.`,
  });

  const [config] = await db.select().from(ssoConfigurations).where(eq(ssoConfigurations.organizationId, user.organizationId));
  return NextResponse.json({ config });
}

export async function DELETE() {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(ssoConfigurations).where(eq(ssoConfigurations.organizationId, user.organizationId));
  await logAudit({
    actor: user,
    action: "sso_configuration.removed",
    entityType: "sso_configuration",
    organizationId: user.organizationId,
    detail: `${user.name} removed the SSO configuration.`,
  });
  return NextResponse.json({ ok: true });
}
