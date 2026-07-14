import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import LoginCard from "@/components/LoginCard";
import {
  Rocket,
  Sparkles,
  FileSearch,
  FileBarChart,
  Lightbulb,
  ClipboardList,
  LineChart,
  LayoutDashboard,
} from "lucide-react";

// The single homepage at "/" -- for everyone, signed in or not. It used to redirect
// signed-in visitors straight to "/home", which meant "/" only ever existed for people
// who'd never logged in. Now it's the one home page: logged-out visitors get the pitch
// + an embedded login form; signed-in visitors get the same page with a "Go to the
// Tracker" card in that slot instead, linking into /home (the app's own welcome page,
// which has its own "Go to the Tracker" banner into the dashboard).
//
// Styled as a real product site rather than reusing the app's flat white/slate card look:
// a solid sticky nav with in-page links (so it feels navigable, not just a single scroll),
// a dark navy hero band (brand navy #152A43 from the logo), a numbered "how it works"
// section, and a features section -- modeled after a standard SaaS marketing layout.
export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    await logActivity({ type: "PUBLIC_VISIT", path: "/" });
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/keel-mark.svg" alt="Keel" width={24} height={24} />
            <span className="text-sm font-semibold text-slate-900">Keel</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-500">
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How it works</a>
            <a href="#features" className="hover:text-slate-900 transition-colors">What you get</a>
            <Link href="/privacy" className="hover:text-slate-900 transition-colors">Privacy</Link>
          </nav>
          {user ? (
            <Link
              href="/home"
              className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
            >
              Go to Tracker
            </Link>
          ) : (
            <a
              href="#login"
              className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
            >
              Log in
            </a>
          )}
        </div>
      </header>

      <section className="bg-gradient-to-b from-indigo-50/70 via-slate-50/60 to-white pt-16 pb-16">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10 items-center">
          <div>
            <p className="inline-block text-xs font-semibold tracking-wide uppercase text-indigo-600 bg-indigo-50 rounded-full px-3 py-1 mb-5">
              Built for boutique IT consultancies
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-slate-900 leading-tight mb-5">
              One place to run every engagement, from idea to invoice.
            </h1>
            <p className="text-base text-slate-600 mb-6 max-w-lg">
              Keel is an AI-driven project and portfolio tracker: it plans work, drafts charters and
              RFPs, watches budgets and risk, briefs you out loud, and turns your whole portfolio into
              board-ready reports — so your team spends less time updating trackers and more time
              delivering.
            </p>
            <div className="flex items-center gap-4 mb-4">
              <a
                href="#how-it-works"
                className="text-sm font-medium px-5 py-2.5 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 transition-colors"
              >
                See how it works
              </a>
              {user ? (
                <Link href="/home" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                  Go to Tracker →
                </Link>
              ) : (
                <a href="#login" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                  Log in →
                </a>
              )}
            </div>
            {!user && (
              <p className="text-xs text-slate-400">
                Keel is invite-only — your Keel administrator sets up your account and organization.
              </p>
            )}
          </div>
          <div className="flex justify-center lg:justify-end">
            {user ? (
              <Link
                href="/home"
                id="login"
                className="group w-full max-w-sm bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6 flex items-center gap-4 hover:border-indigo-300 transition-colors"
              >
                <div className="h-11 w-11 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <LayoutDashboard size={22} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 mb-0.5">Go to the Tracker</p>
                  <p className="text-xs text-slate-500">Welcome back, {user.name.split(" ")[0]} — head into your workspace.</p>
                </div>
              </Link>
            ) : (
              <LoginCard id="login" />
            )}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-16 scroll-mt-16">
        <p className="text-xs font-semibold tracking-wide uppercase text-indigo-600 mb-2">How it works</p>
        <h2 className="text-xl font-semibold text-slate-900 mb-10">From a first idea to a board-ready report, in four steps.</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <Step
            number="01"
            icon={<Lightbulb size={20} />}
            title="Ideate"
            description="Brainstorm the opportunity, run an AI feasibility check, and build the case before it becomes a project."
          />
          <Step
            number="02"
            icon={<ClipboardList size={20} />}
            title="Charter & plan"
            description="AI drafts the charter, RFP, and delivery plan — Waterfall, Scrum, or hybrid — with tasks, estimates, and assignments."
          />
          <Step
            number="03"
            icon={<Rocket size={20} />}
            title="Execute & track"
            description="Run sprints or phases, log time and budgets, triage support incidents, and keep risk visible across the portfolio."
          />
          <Step
            number="04"
            icon={<LineChart size={20} />}
            title="Report"
            description="Generate branded, board-ready PDF and PowerPoint reports on demand — status updates, steering decks, executive one-pagers."
          />
        </div>
      </section>

      <section id="features" className="bg-slate-50 border-y border-slate-200 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <p className="text-xs font-semibold tracking-wide uppercase text-indigo-600 mb-2">What you get</p>
          <h2 className="text-xl font-semibold text-slate-900 mb-10">Everything a boutique consultancy needs to run delivery, in one tracker.</h2>
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
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-14 text-center">
        <h2 className="text-xl font-semibold text-slate-900 mb-3">
          {user ? "Ready to jump back in?" : "Ready to run your next engagement in Keel?"}
        </h2>
        <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
          {user
            ? "Head into your workspace to pick up where you left off."
            : "Keel is invite-only. Your administrator sets up your account — once you're in, sign in below."}
        </p>
        {user ? (
          <Link
            href="/home"
            className="inline-block text-sm font-medium px-5 py-2.5 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 transition-colors"
          >
            Go to the Tracker
          </Link>
        ) : (
          <a
            href="#login"
            className="inline-block text-sm font-medium px-5 py-2.5 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 transition-colors"
          >
            Log in to Keel
          </a>
        )}
      </section>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-slate-400">
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

function Step({
  number,
  icon,
  title,
  description,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-semibold text-indigo-400">{number}</span>
        <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">{icon}</div>
      </div>
      <p className="text-sm font-semibold text-slate-900 mb-1.5">{title}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}
