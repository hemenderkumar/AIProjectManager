const SAFE_NAME_RE = /^[^<>"\r\n\t]+$/;

// Replace only the display name of a configured "Name <addr@host>" (or bare address) sender,
// keeping the verified sending address. Falls back to the original if the name is empty/unsafe.
export function buildFromAddress(defaultFrom: string, displayName?: string | null): string {
  const name = displayName?.trim();
  if (!name || !SAFE_NAME_RE.test(name)) return defaultFrom;
  const m = /<([^>]+)>/.exec(defaultFrom);
  const addr = (m ? m[1] : defaultFrom).trim();
  return `${name} <${addr}>`;
}

export type EmailOptions = {
  // Display name for the sender (white-label); the verified sending address is unchanged.
  fromName?: string | null;
  replyTo?: string | null;
  html?: string;
};

export async function sendEmail(to: string, subject: string, text: string, opts: EmailOptions = {}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const defaultFrom = process.env.EMAIL_FROM || "Executa <onboarding@resend.dev>";
  if (!apiKey) return false;
  const from = buildFromAddress(defaultFrom, opts.fromName);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        ...(opts.html ? { html: opts.html } : {}),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
