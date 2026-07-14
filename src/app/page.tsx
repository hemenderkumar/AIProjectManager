import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import LoginCard from "@/components/LoginCard";
import { Rocket, Sparkles, FileSearch, FileBarChart } from "lucide-react";

// The public marketing homepage. Previously "/" just redirected straight into "/home",
// which (for anyone not already signed in) meant the very first thing a visitor ever saw
// was a bare login form with zero context about what the product even is. Signed-in
// visitors still skip straight past this to their real landing page.
//
// Deliberately styled distinct from the app shell (dark navy hero band, larger type)
// rather than reusing the app's flat white/slate card look -- a visitor who lands here
// should immediately read it as a product site, not mistake it for the tracker itself.
export default async function MarketingHomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/home");
  }

  await logActivity({ type: "PUBLIC_VISIT", path: "/" });

  return (
    <div className="min-h-screen bg-white">
      <header className="absolute top-0 inset-x-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-white rounded-md p-1">
              <Image src="/keel-mark.svg" alt="Keel" width={26} height={26} />
            </div>
            <span className="text-sm font-semibold text-white">Keel</span>
          </div>
          <a
            href="#login"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-white text-[#152A43] transition-colors hover:bg-indigo-50"
          >
            Log in
          </a>
        </div>
      </header>

      <section className="bg-gradient-to-br from-[#152A43] via-[#1c3a5e] to-indigo-800 pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10 items-center">
          <div>
            <p className="inline-block text-xs font-semibold tracking-wide uppercase text-indigo-100 bg-white/10 rounded-full px-3 py-1 mb-5">
              Built for boutique IT consultancies
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white leading-tight mb-5">
              One place to run every engagement, from idea to invoice.
            </h1>
            <p className="text-base text-indigo-100/90 mb-2 max-w-lg">
              Keel is an AI-driven project and portfolio tracker: it plans work, drafts charters and
              RFPs, watches budgets and risk, briefs you out loud, and turns your whole portfolio into
              board-ready reports — so your team spends less time updating trackers and more time
              delivering.
            </p>
            <p className="text-xs text-indigo-200/60">
              Keel is invite-only — your Keel administrator sets up your account and organization.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <LoginCard id="login" />
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <p className="text-xs font-semibold tracking-wide uppercase text-indigo-600 mb-2">What you get</p>
        <h2 className="text-xl font-semibold text-slate-900 mb-8">Everything a boutique consultancy needs to run delivery, in one tracker.</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
          <FeatureRow
            icon={<Rocket size={20} />}
            title="Full project lifecycle"
            description="Ideation, charters, sprints or waterfall phases, tasks, risks, budgets, and ongoing support — one tracker from first idea to steady-state."
          />
          <FeatureRow
            icon={<Sparkles size={20} />}
            title="An AI project manager"
            description="Drafts charters and plans, estimates effort, suggests assignments, briefs you out loud, and answers questions about your whole portfolio."
          />
          <FeatureRow
            icon={<FileSearch size={20} />}
            title="Vendor evaluation, built in"
            description="Draft an RFP from a project charter, invite vendors with a no-login link, and let AI score responses against your own weighted rubric."
          />
          <FeatureRow
            icon={<FileBarChart size={20} />}
            title="Reports that look the part"
            description="Branded, board-ready PDF and PowerPoint exports for status reports, steering committee decks, and executive one-pagers — generated on demand."
          />
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50">
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

function FeatureRow({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-11 h-11 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900 mb-1">{title}</p>
        <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
