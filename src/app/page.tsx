import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import LoginCard from "@/components/LoginCard";
import { Rocket, Sparkles, FileSearch, FileBarChart, ArrowRight, Inbox } from "lucide-react";

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

// Executa's own dedicated public homepage -- deliberately no ProjectRequesta mentions, cards,
// or cross-links here. Executa and ProjectRequesta are two independent products that happen to
// share a backend; each gets its own standalone pitch (see /marketplace for ProjectRequesta's).
// Logged-out visitors get the pitch + an embedded login form; signed-in visitors get the same
// page with a personalized hero and a direct entry point into the product instead.
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
            <Image src="/executa-mark.svg" alt="Executa" width={24} height={24} />
            <span className="text-sm font-semibold text-slate-900">Executa</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-500">
            <a href="#features" className="hover:text-slate-900 transition-colors">Product</a>
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How it works</a>
          </nav>
          {user ? (
            <Link
              href="/dashboard"
              className="text-sm font-medium px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700"
            >
              Go to Executa
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/register" className="hidden sm:inline text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                Sign up
              </Link>
              <a
                href="#login"
                className="text-sm font-medium px-4 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700"
              >
                Log in
              </a>
            </div>
          )}
        </div>
      </header>

      <section className="bg-gradient-to-b from-accent-50/70 via-slate-50/60 to-white pt-16 pb-16">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10 items-center">
          <div>
            <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-5">
              Guiding project success
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-slate-900 leading-tight tracking-tight mb-5">
              From a first idea to a board-ready report, without leaving one tracker.
            </h1>
            <p className="text-base text-slate-600 mb-8 max-w-lg">
              Executa is an AI-driven project and portfolio tracker for running your own team&apos;s
              engagements end to end — ideation, AI-drafted charters, sprints or waterfall
              phases, risk and budget tracking, and board-ready reports.
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <a
                href="#how-it-works"
                className="inline-block text-sm font-medium px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors"
              >
                See how it works
              </a>
              {!user && (
                <Link
                  href="/demand-request"
                  className="inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors"
                >
                  <Inbox size={15} /> Submit a project idea
                </Link>
              )}
            </div>
            {!user && (
              <p className="text-xs text-slate-400">
                Individuals get instant access with{" "}
                <Link href="/register" className="text-accent-600 hover:text-accent-700 font-medium">
                  self-service sign-up
                </Link>
                . Company accounts are reviewed by an admin before access is granted.
              </p>
            )}
          </div>
          <div className="flex justify-center lg:justify-end">
            {user ? (
              <div id="login" className="w-full max-w-sm bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6 text-center">
                <p className="text-sm font-semibold text-slate-900 mb-1.5">Welcome back, {user.name.split(" ")[0]}</p>
                <p className="text-xs text-slate-500 mb-5">Jump back into your portfolio.</p>
                <Link
                  href="/dashboard"
                  className="flex items-center justify-center gap-2 w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 transition-colors"
                >
                  <Rocket size={15} /> Go to Executa
                </Link>
              </div>
            ) : (
              <LoginCard id="login" />
            )}
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="rounded-xl border border-slate-200 shadow-sm shadow-slate-200/60 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Executa: Portfolio Dashboard</p>
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
        <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-2">How Executa works</p>
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
          <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-2">What you get</p>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-10">Everything a boutique consultancy needs to run its own delivery.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
            <div>
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
            </div>
            <div>
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
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-slate-200">
        <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-2">Not just another task tracker</p>
        <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-4 max-w-2xl">
          Asana and Monday manage tasks once a project already exists. Executa manages the decision
          to start one — and everything after.
        </h2>
        <p className="text-sm text-slate-600 max-w-2xl mb-10">
          That&apos;s the actual wedge: three things a generic task tracker was never built to do.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div>
            <p className="text-sm font-semibold text-slate-900 mb-1.5">Ideation gates, not a blank board</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Every idea passes through feasibility, architecture, and resourcing gates before it
              becomes a funded project — so half-baked ideas don&apos;t quietly turn into
              half-finished projects.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 mb-1.5">AI drafting, not a blank template</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Charters, RFPs, SOWs, and delivery plans are AI-drafted from a one-line idea — Waterfall,
              Scrum, or hybrid — not built one field at a time from an empty template.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 mb-1.5">RFP/SOW workflow, built in</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Evaluate vendors, generate a Statement of Work, and track deliverables against it —
              without exporting anything to a separate procurement tool.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-accent-600">
        <div className="max-w-5xl mx-auto px-6 py-14 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          <div>
            <h2 className="text-xl font-semibold text-white tracking-tight mb-2">Have a project idea? You don&apos;t need an account to pitch it.</h2>
            <p className="text-sm text-accent-100 max-w-xl">
              Submit a demand request in a couple of minutes — no login required. An admin triages it, scores it against
              your portfolio, and converts it into a project if it&apos;s a fit.
            </p>
          </div>
          <Link
            href="/demand-request"
            className="shrink-0 inline-flex items-center gap-2 text-sm font-medium px-5 py-3 rounded-lg bg-white text-accent-700 shadow-sm hover:bg-accent-50 transition-colors"
          >
            <Inbox size={16} /> Submit a demand request
          </Link>
        </div>
      </section>

      <footer className="bg-white">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Executa</span>
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
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function FeatureRow({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="border-t border-slate-200 py-6 pr-8">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-accent-600">{icon}</span>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
      </div>
      <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="border-t border-slate-200 pt-5 pr-6">
      <p className="text-xs font-semibold text-accent-300 mb-2">{number}</p>
      <p className="text-sm font-semibold text-slate-900 mb-1.5">{title}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}
