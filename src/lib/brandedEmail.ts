import { sendEmail } from "./email";
import { getEmailSettingsForOrg, renderBrandedEmailHtml } from "./branding";

// Client-facing email sent on behalf of a consulting company: the sender display name, reply-to,
// header color/name and "Powered by" footer all follow that organization's white-label settings.
// Falls back to default Executa styling if the org has none configured.
export async function sendBrandedEmail(opts: {
  organizationId: string;
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
}): Promise<boolean> {
  const settings = await getEmailSettingsForOrg(opts.organizationId);
  const branding = settings?.branding ?? { name: "Executa", brandColor: null, hidePoweredBy: false };
  const html = renderBrandedEmailHtml({ branding, heading: opts.heading, paragraphs: opts.paragraphs, cta: opts.cta });
  const text = [opts.heading, "", ...opts.paragraphs, ...(opts.cta ? ["", `${opts.cta.label}: ${opts.cta.url}`] : [])].join("\n");
  return sendEmail(opts.to, opts.subject, text, {
    fromName: settings?.fromName || settings?.branding.name || null,
    replyTo: settings?.replyTo ?? null,
    html,
  });
}
