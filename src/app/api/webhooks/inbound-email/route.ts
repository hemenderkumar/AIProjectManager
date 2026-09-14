import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { findActiveRouteByAddress, createIncidentFromEmail } from "@/lib/emailIntake";

// Receives Resend's `email.received` webhook (see lib/emailIntake.ts / Settings > Integrations
// "Email intake") and turns it into an incident with zero integration code on the sender's
// side -- they just email the address an admin configured.
//
// Two Resend quirks this route works around:
// 1. The webhook payload is metadata only (from/to/subject/attachment list) -- the body has to
//    be fetched separately via resend.emails.receiving.get(email_id).
// 2. Signatures are Svix-based. The installed SDK's verify() call takes short header field
//    names (id/timestamp/signature) that must be populated FROM the wire's svix-id/
//    svix-timestamp/svix-signature headers -- it does not read the HTTP headers itself.
export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    // Fail closed: this endpoint creates data from an unauthenticated source, so without a
    // configured signing secret there's no way to trust a request came from Resend at all.
    return NextResponse.json({ error: "Email intake is not configured (missing RESEND_API_KEY / RESEND_WEBHOOK_SECRET)." }, { status: 501 });
  }

  // Must read the raw text body -- signature verification hashes the exact bytes Resend sent;
  // parsing as JSON first (and re-serializing) would produce a different byte sequence and
  // always fail verification.
  const payload = await req.text();
  const resend = new Resend(apiKey);

  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "email.received") {
    // Only subscribed to email.received in practice, but ack anything else so Resend doesn't
    // retry a webhook we're simply not set up to act on.
    return NextResponse.json({ ok: true });
  }

  const recipients = event.data.to.map((addr) => addr.toLowerCase().trim());
  let route = null;
  for (const addr of recipients) {
    route = await findActiveRouteByAddress(addr);
    if (route) break;
  }
  if (!route) {
    // No matching (or deactivated) route -- nothing to do. Ack with 200 regardless so Resend
    // doesn't keep retrying mail sent to an address that was never configured or was later
    // deactivated.
    return NextResponse.json({ ok: true });
  }

  const { data: email, error } = await resend.emails.receiving.get(event.data.email_id);
  if (error || !email) {
    // Transient Resend-side issue fetching the body -- ack anyway; there's nothing a retry of
    // OUR endpoint would fix since the failure is on their read, not our processing.
    return NextResponse.json({ ok: true });
  }

  await createIncidentFromEmail(route, {
    from: email.from,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return NextResponse.json({ ok: true });
}
