"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import LoginCard from "@/components/LoginCard";

// Maps the short ?error= codes the SSO ACS/login routes redirect back with (see
// /api/sso/acs/[orgId] and /api/sso/login/[orgId]) into copy a person can actually act on.
// Falls through to showing the raw string for the one case (provisionAndSignInSsoUser's
// account-mismatch/disabled messages) that's already human-readable.
const SSO_ERROR_MESSAGES: Record<string, string> = {
  sso_not_configured: "SSO is not set up (or is disabled) for this organization. Ask your admin to enable it, or sign in with a password below.",
  sso_invalid_response: "Your identity provider didn't return a valid sign-in response. Try again, or contact your admin.",
  sso_verification_failed: "We couldn't verify that sign-in response. Contact your Executa administrator if this keeps happening.",
  sso_no_email: "Your identity provider didn't include an email address. Contact your Executa administrator.",
  sso_domain_mismatch: "The email returned by your identity provider doesn't match this organization's configured domain.",
};

type Branding = {
  name: string;
  logoDataUrl: string | null;
  brandColor: string | null;
  tagline: string | null;
  hidePoweredBy: boolean;
};

function LoginScreen() {
  const params = useSearchParams();
  const errorCode = params.get("error");
  const ssoError = errorCode ? (SSO_ERROR_MESSAGES[errorCode] ?? decodeURIComponent(errorCode)) : null;
  const orgSlug = params.get("org");
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    fetch("/api/activity/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/login" }),
    }).catch(() => {});
  }, []);

  // White-label: /login?org=<slug> shows the consulting company's logo, name, color and
  // tagline instead of Executa's. Unknown slugs silently fall back to the default screen.
  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    fetch(`/api/branding/${encodeURIComponent(orgSlug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!cancelled && b) setBranding(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  const brandStyle = branding?.brandColor
    ? ({ ["--org-brand" as string]: branding.brandColor } as React.CSSProperties)
    : undefined;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 gap-6"
      style={brandStyle}
      data-theme={branding?.brandColor ? "custom" : undefined}
    >
      <div className="flex items-center gap-2.5">
        {branding ? (
          <>
            {branding.logoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoDataUrl} alt="" className="h-9 w-9 object-contain" />
            )}
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-tight">{branding.name}</p>
              {branding.tagline && <p className="text-xs text-slate-400 leading-tight">{branding.tagline}</p>}
            </div>
          </>
        ) : (
          <>
            <Image src="/executa-mark.svg" alt="Executa" width={36} height={36} />
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-tight">Executa</p>
              <p className="text-xs text-slate-400 leading-tight">Guiding project success</p>
            </div>
          </>
        )}
      </div>
      <LoginCard next={params.get("next") ?? undefined} ssoError={ssoError} />
      {branding && !branding.hidePoweredBy && <p className="text-[11px] text-slate-400">Powered by Executa</p>}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
