import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));

import { validateDecision, validateAttachment, canClientDecide, authorSideFor } from "@/lib/deliverableReview";
import { validateWhiteLabel, renderBrandedEmailHtml, escapeHtml } from "@/lib/branding";
import { buildFromAddress } from "@/lib/email";
import {
  displayStatus, nextInvoiceNumber, computeApplicationFee, parseAmountToCents, validateInvoiceInput, canTransition,
} from "@/lib/clientInvoices";

const user = (role: string, organizationId: string | null) =>
  ({ id: "u", name: "U", email: "u@x.com", role, organizationId }) as never;

describe("deliverable review", () => {
  it("only lets client-side CONTRIBUTOR+ decide", () => {
    expect(canClientDecide(user("CONTRIBUTOR", "org"))).toBe(true);
    expect(canClientDecide(user("SUPER_USER", "org"))).toBe(true);
    expect(canClientDecide(user("VIEWER", "org"))).toBe(false);
    expect(canClientDecide(user("PM", null))).toBe(false);
  });
  it("tags author side", () => {
    expect(authorSideFor(user("VIEWER", "org"))).toBe("CLIENT");
    expect(authorSideFor(user("PM", null))).toBe("TEAM");
  });
  it("requires IN_REVIEW and a note for changes", () => {
    expect(validateDecision("APPROVE", "", "IN_REVIEW")).toMatchObject({ ok: true, status: "APPROVED" });
    expect(validateDecision("REQUEST_CHANGES", "  ", "IN_REVIEW")).toMatchObject({ ok: false });
    expect(validateDecision("REQUEST_CHANGES", "fix x", "IN_REVIEW")).toMatchObject({ ok: true, status: "CHANGES_REQUESTED", note: "fix x" });
    expect(validateDecision("APPROVE", "", "DRAFT")).toMatchObject({ ok: false });
    expect(validateDecision("NOPE", "", "IN_REVIEW")).toMatchObject({ ok: false });
  });
  it("validates attachments", () => {
    const b64 = Buffer.from("hello").toString("base64");
    expect(validateAttachment({ filename: "a b.pdf", mime: "application/pdf", dataBase64: b64 })).toMatchObject({ ok: true, size: 5 });
    expect(validateAttachment({ filename: "x.exe", mime: "application/x-msdownload", dataBase64: b64 })).toMatchObject({ ok: false });
    expect(validateAttachment({ filename: "x.pdf", mime: "application/pdf", dataBase64: "A".repeat(6_000_000) })).toMatchObject({ ok: false });
    expect(validateAttachment({ filename: "x.pdf", dataBase64: `data:application/pdf;base64,${b64}` })).toMatchObject({ ok: true, mime: "application/pdf" });
    expect(validateAttachment({ filename: "../../etc/p", mime: "text/plain", dataBase64: b64 })).toMatchObject({ ok: true, filename: ".._.._etc_p" });
  });
});

describe("white-label validation", () => {
  it("accepts valid fields and normalizes the slug", () => {
    const r = validateWhiteLabel({ loginSlug: " Acme-Co ", brandDisplayName: "Acme", hidePoweredBy: true, emailReplyTo: "a@b.co" });
    expect(r).toEqual({ ok: true, updates: { loginSlug: "acme-co", brandDisplayName: "Acme", hidePoweredBy: true, emailReplyTo: "a@b.co" } });
  });
  it("rejects reserved/invalid slugs and unsafe names", () => {
    expect(validateWhiteLabel({ loginSlug: "admin" })).toMatchObject({ ok: false });
    expect(validateWhiteLabel({ loginSlug: "a" })).toMatchObject({ ok: false });
    expect(validateWhiteLabel({ loginSlug: "bad_slug!" })).toMatchObject({ ok: false });
    expect(validateWhiteLabel({ emailFromName: 'Evil" <x@y>' })).toMatchObject({ ok: false });
    expect(validateWhiteLabel({ emailReplyTo: "not-an-email" })).toMatchObject({ ok: false });
    expect(validateWhiteLabel({ hidePoweredBy: "yes" })).toMatchObject({ ok: false });
  });
  it("clears fields with empty/null", () => {
    expect(validateWhiteLabel({ loginSlug: "", brandDisplayName: null })).toEqual({ ok: true, updates: { loginSlug: null, brandDisplayName: null } });
  });
});

describe("branded email", () => {
  it("swaps only the display name", () => {
    expect(buildFromAddress("Executa <no-reply@x.com>", "Acme PMO")).toBe("Acme PMO <no-reply@x.com>");
    expect(buildFromAddress("no-reply@x.com", "Acme")).toBe("Acme <no-reply@x.com>");
    expect(buildFromAddress("Executa <no-reply@x.com>", null)).toBe("Executa <no-reply@x.com>");
    expect(buildFromAddress("Executa <no-reply@x.com>", 'a"b')).toBe("Executa <no-reply@x.com>");
  });
  it("escapes html and honors hidePoweredBy", () => {
    const html = renderBrandedEmailHtml({
      branding: { name: "<b>Acme</b>", brandColor: "#112233", hidePoweredBy: true },
      heading: "Hi", paragraphs: ["a < b"], cta: { label: "Go", url: "https://x.test/p" },
    });
    expect(html).toContain("&lt;b&gt;Acme&lt;/b&gt;");
    expect(html).toContain("#112233");
    expect(html).not.toContain("Powered by Executa");
    expect(escapeHtml('"&')).toBe("&quot;&amp;");
    expect(renderBrandedEmailHtml({ branding: { name: "A", brandColor: null, hidePoweredBy: false }, heading: "h", paragraphs: [] })).toContain("Powered by Executa");
  });
  it("drops javascript: CTA urls", () => {
    const html = renderBrandedEmailHtml({ branding: { name: "A", brandColor: null, hidePoweredBy: true }, heading: "h", paragraphs: [], cta: { label: "x", url: "javascript:alert(1)" } });
    expect(html).not.toContain("javascript:");
  });
});

describe("client invoices", () => {
  it("numbers sequentially per org", () => {
    expect(nextInvoiceNumber([])).toBe("INV-0001");
    expect(nextInvoiceNumber(["INV-0001", "INV-0009", "custom"])).toBe("INV-0010");
  });
  it("parses money to cents with bounds", () => {
    expect(parseAmountToCents("$1,234.56")).toBe(123456);
    expect(parseAmountToCents(10)).toBe(1000);
    expect(parseAmountToCents("0.10")).toBeNull();
    expect(parseAmountToCents("-5")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("1000000")).toBeNull();
  });
  it("computes platform fee by floor, zero by default", () => {
    expect(computeApplicationFee(10000, 0)).toBe(0);
    expect(computeApplicationFee(10000, 100)).toBe(100);
    expect(computeApplicationFee(999, 150)).toBe(14);
    expect(computeApplicationFee(10000, NaN)).toBe(0);
  });
  it("derives OVERDUE only for SENT past due", () => {
    const now = new Date("2026-10-25T00:00:00Z");
    expect(displayStatus({ status: "SENT", dueDate: new Date("2026-10-01") }, now)).toBe("OVERDUE");
    expect(displayStatus({ status: "SENT", dueDate: new Date("2026-11-01") }, now)).toBe("SENT");
    expect(displayStatus({ status: "PAID", dueDate: new Date("2026-10-01") }, now)).toBe("PAID");
    expect(displayStatus({ status: "SENT", dueDate: null }, now)).toBe("SENT");
  });
  it("never allows manual PAID and guards transitions", () => {
    expect(canTransition("DRAFT", "SENT")).toBe(true);
    expect(canTransition("SENT", "VOID")).toBe(true);
    expect(canTransition("SENT", "PAID")).toBe(false);
    expect(canTransition("PAID", "VOID")).toBe(false);
    expect(canTransition("VOID", "SENT")).toBe(false);
  });
  it("validates invoice input", () => {
    expect(validateInvoiceInput({ amount: "250", dueDate: "2026-12-01", description: " Phase 1 " })).toMatchObject({ ok: true, amountCents: 25000, description: "Phase 1" });
    expect(validateInvoiceInput({ amount: "0" })).toMatchObject({ ok: false });
    expect(validateInvoiceInput({ amount: "5", dueDate: "nope" })).toMatchObject({ ok: false });
  });
});
