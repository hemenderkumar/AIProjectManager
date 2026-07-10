import Link from "next/link";
import Topbar from "@/components/Topbar";
import { Lightbulb, LifeBuoy, Rocket } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div>
      <Topbar title={`Welcome${user ? `, ${user.name.split(" ")[0]}` : ""}`} subtitle="What are you working on today?" />
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl">
          <ChoiceCard
            href="/ideation"
            icon={<Lightbulb size={22} className="text-indigo-600" />}
            title="New Ideation"
            description="Brainstorm a new opportunity or a problem that needs solving, run a feasibility check, and build the case before it becomes a project."
            cta="Start ideating"
          />
          <ChoiceCard
            href="/execution"
            icon={<Rocket size={22} className="text-indigo-600" />}
            title="New Project"
            description="Skip ideation and kick off a new project directly — the AI planner is ready as soon as it's created."
            cta="Start a project"
          />
          <ChoiceCard
            href="/support"
            icon={<LifeBuoy size={22} className="text-indigo-600" />}
            title="Project Support"
            description="Log or triage an incident on a live project, or estimate what ongoing support should cost."
            cta="Go to Ongoing Support"
          />
        </div>

        <div className="mt-8 max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-3">
          <QuickLink href="/dashboard" label="Portfolio Dashboard" />
          <QuickLink href="/projects" label="All Projects" />
          <QuickLink href="/reports" label="Reports" />
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({
  href,
  icon,
  title,
  description,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all flex flex-col"
    >
      <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-3">{icon}</div>
      <p className="text-sm font-semibold text-slate-900 mb-1.5">{title}</p>
      <p className="text-xs text-slate-500 leading-relaxed flex-1">{description}</p>
      <p className="text-xs font-medium text-indigo-600 mt-3 group-hover:underline">{cta} →</p>
    </Link>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-xs px-3 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-center"
    >
      {label}
    </Link>
  );
}
