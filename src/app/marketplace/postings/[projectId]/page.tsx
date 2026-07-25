import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { prProjects, prOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { Globe2, Users, MapPin, Calendar } from "lucide-react";

async function loadPosting(projectId: string) {
  const [row] = await db
    .select({
      id: prProjects.id,
      title: prProjects.title,
      description: prProjects.description,
      category: prProjects.category,
      targetBudget: prProjects.targetBudget,
      currency: prProjects.currency,
      engagementModel: prProjects.engagementModel,
      locationRequirement: prProjects.locationRequirement,
      requestType: prProjects.requestType,
      skillsRequired: prProjects.skillsRequired,
      durationWeeks: prProjects.durationWeeks,
      rateType: prProjects.rateType,
      deadline: prProjects.deadline,
      createdAt: prProjects.createdAt,
      status: prProjects.status,
      clientOrgName: prOrganizations.name,
      clientOrgCountry: prOrganizations.primaryCountry,
    })
    .from(prProjects)
    .innerJoin(prOrganizations, eq(prProjects.clientOrgId, prOrganizations.id))
    .where(eq(prProjects.id, projectId));
  if (!row || row.status !== "OPEN") return null;
  return row;
}

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  const posting = await loadPosting(projectId);
  if (!posting) return { title: "Posting not found | ProjectRequesta" };
  return {
    title: `${posting.title} — ${posting.clientOrgName} | ProjectRequesta Marketplace`,
    description: posting.description?.slice(0, 160) || `${posting.title}, posted by ${posting.clientOrgName} on the ProjectRequesta marketplace.`,
  };
}

export default async function PublicPostingDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const posting = await loadPosting(projectId);
  if (!posting) notFound();

  const user = await getCurrentUser();
  if (!user) await logActivity({ type: "PUBLIC_VISIT", path: `/marketplace/postings/${projectId}` });

  const isResourceRequest = posting.requestType === "RESOURCE_REQUEST";

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/marketplace" className="flex items-center gap-2.5">
            <Image src="/executa-mark.svg" alt="Executa" width={24} height={24} />
            <span className="text-sm font-semibold text-slate-900">ProjectRequesta Marketplace</span>
          </Link>
          <Link href="/marketplace" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
            All postings
          </Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center gap-2 mb-3">
          {isResourceRequest ? <Users size={16} className="text-slate-400" /> : <Globe2 size={16} className="text-slate-400" />}
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            {isResourceRequest ? "Resource request" : "Project"} · {posting.category ?? "Uncategorized"}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight mb-3">{posting.title}</h1>
        <div className="flex items-center gap-4 text-xs text-slate-400 mb-6">
          <span>Posted by {posting.clientOrgName}</span>
          {posting.clientOrgCountry && <span className="flex items-center gap-1"><MapPin size={12} /> {posting.clientOrgCountry}</span>}
          {posting.deadline && (
            <span className="flex items-center gap-1"><Calendar size={12} /> Deadline {new Date(posting.deadline).toLocaleDateString()}</span>
          )}
        </div>

        {posting.description && (
          <p className="text-sm text-slate-700 leading-relaxed mb-6 whitespace-pre-wrap">{posting.description}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          {posting.targetBudget != null && (
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-xs text-slate-400">{isResourceRequest ? "Rate" : "Target budget"}</p>
              <p className="text-sm font-semibold text-slate-800">
                {posting.currency} {posting.targetBudget.toLocaleString()}
                {isResourceRequest && posting.rateType ? `/${posting.rateType.toLowerCase()}` : ""}
              </p>
            </div>
          )}
          {isResourceRequest && posting.durationWeeks != null && (
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-xs text-slate-400">Duration</p>
              <p className="text-sm font-semibold text-slate-800">{posting.durationWeeks} weeks</p>
            </div>
          )}
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-xs text-slate-400">Engagement model</p>
            <p className="text-sm font-semibold text-slate-800">{posting.engagementModel === "MEDIATOR" ? "Executa-mediated" : "Direct marketplace"}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-xs text-slate-400">Location</p>
            <p className="text-sm font-semibold text-slate-800">{posting.locationRequirement === "GLOBAL" ? "Open globally" : "Restricted"}</p>
          </div>
        </div>

        {isResourceRequest && posting.skillsRequired && posting.skillsRequired.length > 0 && (
          <div className="mb-8">
            <p className="text-sm font-semibold text-slate-900 mb-2">Skills required</p>
            <div className="flex flex-wrap gap-1.5">
              {posting.skillsRequired.map((s) => (
                <span key={s} className="text-xs px-2 py-1 rounded-full bg-accent-50 text-accent-700">{s}</span>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-1">
            {isResourceRequest ? "Ready to offer a rate?" : "Ready to bid on this project?"}
          </p>
          <p className="text-xs text-slate-500 mb-3">
            Create a free Vendor account on ProjectRequesta to {isResourceRequest ? "offer your rate" : "submit a bid"} — verification is quick, and you only pay a marketplace fee once you win the work.
          </p>
          <Link
            href={user ? `/projectrequesta/projects/${posting.id}` : "/register"}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 transition-colors"
          >
            {user ? "View in ProjectRequesta" : "Sign up to respond"}
          </Link>
        </div>
      </section>
    </div>
  );
}
