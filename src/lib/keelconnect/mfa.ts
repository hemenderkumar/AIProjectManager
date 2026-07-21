import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

// TOTP (RFC 6238) enrollment/verification for the KeelConnect roles the spec mandates MFA
// for -- Client Finance Approver and every Platform role (see MFA_REQUIRED_ROLES in
// access.ts, and the enforcement wired into requireScPlatform/requireScOrgRole there). Works
// with any standard authenticator app (Google/Microsoft Authenticator, 1Password, Authy...).
// otplib v13's API is functional rather than the old `authenticator` singleton from v12 --
// generateSecret/generateURI/verify below are that library's own top-level exports.
//
// users.mfaSecret stores the base32 secret in plaintext. That's acceptable for getting real
// enforcement working end-to-end here, but a production hardening pass should encrypt this
// column at rest (e.g. via a KMS-backed envelope key) before this leaves scaffold status --
// flagged explicitly rather than silently shipped as "done."
const ISSUER = "Keel";

export function generateMfaSecret() {
  return generateSecret();
}

export function buildOtpauthUrl(email: string, secret: string) {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export async function buildQrCodeDataUrl(otpauthUrl: string) {
  return QRCode.toDataURL(otpauthUrl);
}

export async function verifyMfaToken(secret: string, token: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token });
    return result.valid;
  } catch {
    return false;
  }
}
