import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import LoginCard from "@/components/LoginCard";
import { Rocket, Sparkles, FileSearch, FileBarChart } from "lucide-react";

const PREVIEW_PROJECTS = [
  { name: "Core Platform Migration", stage: "Execution", pct: 62, rag: "GREEN" as const },
  { name: "Client Portal Revamp", stage: "Ideation", pct: 18, rag: "YELLOW" as const },
  { name: "Data Warehouse Upgrade", stage: "Execution", pct: 41, rag: "RED" as const },
];

const PREVIEW_RAG_STYLES: Record<string, { bg: string; text: string; dot: string; bar: string }> = {
  GREEN: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  YELLOW: { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500", bar: "bg-amber-500" },
  RED: { bg: "bg-rose-100", text: "text-rose-700", dot: "bg-rose-500", bar: "bg-rose-500" },
};

// The single homepage at "/" -- for everyone, signed in or not. Logged-out visitors get
// the pitch + an embedded login form; signed-in visitors get the same page with a
// personalized hero and a single CTA into /home instead of the login form.
//
// Deliberately restrained: exactly one CTA action per section (header, hero) rather than
// repeating "Log in" / "Go to Tracker" at every turn, a plain numbered list for "How it
// works" instead of a wall of colored icon tiles, and a quieter two-column feature list --
// closer to how Linear/Notion-style B2B SaaS sites read than a template landing page.
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
            <p className="text-xs font-medium tracking-widest uppercase text-indigo-600 mb-5">
              Built for boutique IT consultancies
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-slate-900 leading-tight tracking-tight mb-5">
              One place to run every engagement, from idea to invoice.
            </h1>
            <p className="text-base text-slate-600 mb-8 max-w-lg">
              Keel is an AI-driven project and portfolio tracker: it plans work, drafts charters and
              RFPs, watches budgets and risk, briefs you out loud, and turns your whole portfolio into
              board-ready reports — so your team spends less time updating trackers and more time
              delivering.
            </p>
            <a
              href="#how-it-works"
              className="inline-block text-sm font-medium px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors mb-6"
            >
              See how it works
            </a>
            {!user && (
              <p className="text-xs text-slate-400">
                Keel is invite-only — your Keel administrator sets up your account and organization.
              </p>
            )}
          </div>
          <div className="flex justify-center lg:justify-end">
            {user ? (
              <div id="login" className="w-full max-w-sm bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6 text-center">
                <p className="text-sm font-semibold text-slate-900 mb-1.5">Welcome back, {user.name.split(" ")[0]}</p>
                <p className="text-xs text-slate-500 mb-5">
                  Pick up where you left off — your projects, budgets, and reports are waiting in the tracker.
                </p>
                <Link
                  href="/home"
                  className="block w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 transition-colors"
                >
                  Go to the Tracker
                </Link>
              </div>
            ) : (
              <LoginCard id="login" />
            )}
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="rounded-xl border border-slate-200 shadow-sm shadow-slate-200/60 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Portfolio Dashboard</p>
            <p className="text-xs text-slate-400">Sample data shown</p>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <PreviewStat label="Active projects" value="12" />
              <PreviewStat label="On track" value="8" accent="text-emerald-600" />
              <PreviewStat label="At risk" value="4" accent="text-amber-600" />
              <PreviewStat label="Budget variance" value="+3%" />
            </div>
            <div className="space-y-3">
              {PREVIEW_PROJECTS.map((p) => {
                const c = PREVIEW_RAG_STYLES[p.rag];
                return (
                  <div key={p.name} className="flex items-center gap-4 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.stage}</p>
                    </div>
                    <div className="hidden sm:block w-32 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
                      <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${p.pct}%` }} />
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${c.bg} ${c.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                      {p.rag}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-16 scroll-mt-16">
        <p className="text-xs font-medium tracking-widest uppercase text-indigo-600 mb-2">How it works</p>
        <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-10">From a first idea to a board-ready report, in four steps.</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Step
            number="01"
            title="Ideate"
            description="Brainstorm the opportunity, run an AI feasibility check, and build the case before it becomes a project."
          />
          <Step
            number="02"
            title="Charter & plan"
            description="AI drafts the charter, RFP, and delivery plan — Waterfall, Scrum, or hybrid — with tasks, estimates, and assignments."
          />
          <Step
            number="03"
            title="Execute & track"
            description="Run sprints or phases, log time and budgets, triage support incidents, and keep risk visible across the portfolio."
          />
          <Step
            number="04"
            title="Report"
            description="Generate branded, board-ready PDF and PowerPoint reports on demand — status updates, steering decks, executive one-pagers."
          />
        </div>
      </section>

      <section id="features" className="bg-slate-50 border-y border-slate-200 scroll-mt-16">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="text-xs font-medium tracking-widest uppercase text-indigo-600 mb-2">What you get</p>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-10">Everything a boutique consultancy needs to run delivery, in one tracker.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <FeatureRow
              icon={<Rocket size={16} />}
              title="Full project lifecycle"
              description="Ideation, charters, sprints or waterfall phases, tasks, risks, budgets, and ongoing support — one tracker from first idea to steady-state."
            />
            <FeatureRow
              icon={<Sparkles size={16} />}
              title="An AI project manager"
              description="Drafts charters and plans, estimates effort, suggests assignments, briefs you out loud, and answers questions about your whole portfolio."
            />
            <FeatureRow
              icon={<FileSearch size={16} />}
              title="Vendor evaluation, built in"
              description="Draft an RFP from a project charter, invite vendors with a no-login link, and let AI score responses against your own weighted rubric."
            />
            <FeatureRow
              icon={<FileBarChart size={16} />}
              title="Reports that look the part"
              description="Branded, board-ready PDF and PowerPoint exports for status reports, steering committee decks, and executive one-pagers — generated on demand."
            />
          </div>
        </div>
      </section>

      <footer className="bg-white">
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

function PreviewStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
      <p className={`text-lg font-semibold ${accent ?? "text-slate-900"}`}>{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function FeatureRow({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="border-t border-slate-200 py-6 pr-8">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-indigo-600">{icon}</span>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
      </div>
      <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="border-t border-slate-200 pt-5 pr-6">
      <p className="text-xs font-semibold text-indigo-300 mb-2">{number}</p>
      <p className="text-sm font-semibold text-slate-900 mb-1.5">{title}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}
