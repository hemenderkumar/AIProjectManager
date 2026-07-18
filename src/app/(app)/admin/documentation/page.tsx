"use client";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import DownloadPdfLink from "@/components/DownloadPdfLink";
import { ArrowLeft, FileText, Presentation } from "lucide-react";

type DocCard = {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  filename: string;
};

const DOCS: DocCard[] = [
  {
    icon: <FileText size={18} />,
    title: "Requirements Specification",
    description: "Every module Keel supports, organized by area — ideation through delivery, admin, AI, and mobile.",
    href: "/api/admin/docs/requirements",
    filename: "keel-requirements-specification.docx",
  },
  {
    icon: <FileText size={18} />,
    title: "Design Document",
    description: "Tech stack, architecture, data model, multi-tenancy, AI integration, and key design decisions.",
    href: "/api/admin/docs/design",
    filename: "keel-design-document.docx",
  },
  {
    icon: <FileText size={18} />,
    title: "Training Manual",
    description: "How to use every feature, organized to match the app's own navigation — for whenever you forget.",
    href: "/api/admin/docs/training-manual",
    filename: "keel-training-manual.docx",
  },
  {
    icon: <Presentation size={18} />,
    title: "Product & Growth Overview",
    description: "The pitch deck: problem statement, what Keel can do, SWOT, illustrative revenue/growth scenarios, target clients.",
    href: "/docs/keel-product-growth-overview.pptx",
    filename: "keel-product-growth-overview.pptx",
  },
];

export default function DocumentationPage() {
  return (
    <div>
      <Topbar
        title="Documentation"
        subtitle="Reference documents about Keel itself — download any of these any time"
        action={
          <Link href="/admin" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <ArrowLeft size={14} /> Back to Admin
          </Link>
        }
      />
      <div className="p-8 max-w-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DOCS.map((doc) => (
            <div key={doc.title} className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 flex flex-col">
              <div className="h-9 w-9 rounded-full bg-accent-50 text-accent-600 flex items-center justify-center mb-3">
                {doc.icon}
              </div>
              <p className="text-sm font-semibold text-slate-900">{doc.title}</p>
              <p className="text-xs text-slate-500 mt-1 flex-1">{doc.description}</p>
              <DownloadPdfLink
                href={doc.href}
                filename={doc.filename}
                label={`Download ${doc.filename.endsWith(".pptx") ? "PowerPoint" : "Word doc"}`}
                className="mt-4 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 disabled:opacity-50 w-fit"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
