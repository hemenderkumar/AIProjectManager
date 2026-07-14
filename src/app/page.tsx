import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { Rocket, Sparkles, FileSearch, FileBarChart, ArrowRight } from "lucide-react";

// The public marketing homepage. Previously "/" just redirected straight into "/home",
// which (for anyone not already signed in) meant the very first thing a visitor ever saw
// was a bare login form with zero context about what the product even is. Signed-in
// visitors still skip straight past this to their real landing page.
export default async function MarketingHomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/home");
  }

  await logActivity({ type: "PUBLIC_VISIT", path: "/" });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/keel-mark.svg" alt="Keel" width={30} height={30} />
            <span className="text-sm font-semibold text-slate-900">Keel</span>
          </div>
          <Link
            href="/login"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
          >
            Log in
          </Link>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <p className="inline-block text-xs font-semibold tracking-wide uppercase text-indigo-600 bg-indigo-50 rounded-full px-3 py-1 mb-5">
          Built for boutique IT consultancies
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold text-slate-900 leading-tight mb-5">
          One place to run every engagement, from idea to invoice.
        </h1>
        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto mb-8">
          Keel is an AI-driven project and portfolio tracker: it plans work, drafts charters and
          RFPs, watches budgets and risk, briefs you out loud, and turns your whole portfolio into
          board-ready reports — so your team spends less time updating trackers and more time
          delivering.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-medium px-5 py-3 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
          >
            Log in to your workspace <ArrowRight size={16} />
          </Link>
        </div>
        <p className="text-xs text-slate-400 mt-4">
          Keel is invite-only — your Keel administrator sets up your account and organization.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <FeatureCard
            icon={<Rocket size={20} />}
            title="Full project lifecycle"
            description="Ideation, charters, sprints or waterfall phases, tasks, risks, budgets, and ongoing support — one tracker from first idea to steady-state."
          />
          <FeatureCard
            icon={<Sparkles size={20} />}
            title="An AI project manager"
            description="Drafts charters and plans, estimates effort, suggests assignments, briefs you out loud, and answers questions about your whole portfolio."
          />
          <FeatureCard
            icon={<FileSearch size={20} />}
            title="Vendor evaluation, built in"
            description="Draft an RFP from a project charter, invite vendors with a no-login link, and let AI score responses against your own weighted rubric."
          />
          <FeatureCard
            icon={<FileBarChart size={20} />}
            title="Reports that look the part"
            description="Branded, board-ready PDF and PowerPoint exports for status reports, steering committee decks, and executive one-pagers — generated on demand."
          />
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Keel</span>
          <div className="flex items-center gap-3">
            <Link href="/privacy" className="hover:text-slate-600">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-600">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
      <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-900 mb-1">{title}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}
