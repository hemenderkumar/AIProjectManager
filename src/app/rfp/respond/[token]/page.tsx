import { db } from "@/lib/db";
import { rfpVendors, rfps } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import RespondForm from "./RespondForm";
import DownloadPdfLink from "@/components/DownloadPdfLink";

// Public, no-login vendor response page. The token is the vendor's sole credential — this
// query resolves ONLY that vendor's own row, and only the RFP fields vendors are meant to
// see (title + content). It never touches rfpCriteria (the scoring rubric weights) or any
// other vendor's row, by construction — there's no query here that could return them.
export default async function RfpRespondPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [vendor] = await db.select().from(rfpVendors).where(eq(rfpVendors.token, token));

  if (!vendor) {
    return (
      <Shell>
        <p className="text-sm text-slate-600">
          This link is invalid or has expired. Contact whoever sent it for a new invitation.
        </p>
      </Shell>
    );
  }

  const [rfp] = await db.select().from(rfps).where(eq(rfps.id, vendor.rfpId));
  if (!rfp) {
    return (
      <Shell>
        <p className="text-sm text-slate-600">This RFP is no longer available.</p>
      </Shell>
    );
  }

  // Best-effort view tracking — doesn't block rendering if it fails.
  if (vendor.status === "INVITED") {
    await db.update(rfpVendors).set({ status: "VIEWED", viewedAt: new Date() }).where(eq(rfpVendors.id, vendor.id));
  }

  if (vendor.status === "SUBMITTED") {
    return (
      <Shell wide>
        <h1 className="text-lg font-semibold text-slate-900 mb-1">{rfp.title}</h1>
        <p className="text-sm text-emerald-700 mb-4">
          Thanks, {vendor.contactName || vendor.name} &mdash; your proposal was submitted
          {vendor.submittedAt ? ` on ${new Date(vendor.submittedAt).toLocaleDateString("en-US")}` : ""}. No further action is needed.
        </p>
        <DownloadPdfLink
          href={`/api/rfp-respond/${token}/pdf`}
          filename={`${rfp.title || "rfp"}.pdf`}
          label="Download the RFP as PDF"
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
        />
      </Shell>
    );
  }

  if (vendor.status === "DECLINED") {
    return (
      <Shell wide>
        <h1 className="text-lg font-semibold text-slate-900 mb-1">{rfp.title}</h1>
        <p className="text-sm text-slate-600">You&apos;ve declined this invitation. If that was a mistake, contact whoever sent it.</p>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <p className="text-sm text-slate-500 mb-1">Hi {vendor.contactName || vendor.name},</p>
      <div className="flex items-start justify-between gap-3 mb-4">
        <h1 className="text-xl font-semibold text-slate-900">{rfp.title}</h1>
        {rfp.content && (
          <DownloadPdfLink
            href={`/api/rfp-respond/${token}/pdf`}
            filename={`${rfp.title || "rfp"}.pdf`}
            label="Download as PDF"
            className="shrink-0 text-xs text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap"
          />
        )}
      </div>
      <div className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 max-h-[50vh] overflow-y-auto">
        {rfp.content || "The RFP document is still being prepared. Please check back soon, or contact the requester."}
      </div>
      <RespondForm token={token} />
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6`}>{children}</div>
    </div>
  );
}
