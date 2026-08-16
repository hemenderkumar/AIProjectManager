import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { listActivePlans } from "@/lib/billing";
import { formatPlanPrice } from "@/lib/planFormat";
import LoginCard from "@/components/LoginCard";
import Reveal from "@/components/Reveal";
import HomeDemoCarousel from "@/components/HomeDemoCarousel";
import {
  Rocket,
  Sparkles,
  FileSearch,
  FileBarChart,
  ArrowRight,
  Inbox,
  ShieldCheck,
  Lock,
  KeyRound,
  ScrollText,
  Bot,
  TrendingUp,
  Check,
} from "lucide-react";

const FAQS = [
  {
    q: "How is Executa different from Asana, Monday, or Jira?",
    a: "Those tools manage tasks once a project already exists. Executa manages the decision to start one, too — every idea passes through AI-assisted feasibility, architecture, and resourcing gates before it becomes a funded project, and the AI drafts the charter, RFP, SOW, and delivery plan instead of you starting from a blank template.",
  },
  {
    q: "Do I need a company account, or can I sign up individually?",
    a: "Individuals get instant, self-service access — no waiting on approval. Company accounts (with multiple teammates, divisions, and shared rate cards) are reviewed by an admin before access is granted, since they involve inviting other people into your organization's workspace.",
  },
  {
    q: "What happens when my trial ends?",
    a: "You'll see a clear countdown in the app before it happens. Once the trial ends without an active plan, the account is locked (your data is preserved, nothing is deleted) until you subscribe to a plan or an admin grants an extension.",
  },
  {
    q: "Can I cancel or change plans later?",
    a: "Yes — billing is self-service through Stripe's customer portal, reachable from Billing inside the app. Upgrades, downgrades, and cancellations take effect through your normal billing cycle.",
  },
  {
    q: "Is my data secure?",
    a: "Every action is scoped to your organization and enforced at the API layer, sensitive actions require step-up TOTP verification for finance and platform roles, and every approval, deletion, and rate change is written to an immutable audit log. See Security & compliance below for the full picture.",
  },
];

// Executa's own dedicated public homepage -- deliberately no ProjectRequesta mentions, cards,
// or cross-links here. Executa and ProjectRequesta are two independent products that happen to
// share a backend; each gets its own standalone pitch (see /marketplace for ProjectRequesta's).
// Logged-out visitors get the pitch + an embedded login form; signed-in visitors get the same
// page with a personalized hero and a direct entry point into the product instead.
export default async function HomePage() {
  const [user, plans] = await Promise.all([getCurrentUser(), listActivePlans()]);

  if (!user) {
    await logActivity({ type: "PUBLIC_VISIT", path: "/" });
  }

  return (
    // data-theme="indigo" pinned here, regardless of what the root layout put on <html> --
    // for a logged-out visitor that's already indigo (the default), but a *signed-in* visitor
    // would otherwise see their personal in-app theme (any of the 6 named themes, or their
    // org's custom brand color) bleed into this page's decorative violet/cyan marketing
    // palette, which was never designed to coexist with an arbitrary accent. The marketing
    // page's colors are intentionally fixed, like Stripe/Linear/Vercel's own sites -- it
    // doesn't shift with account state. [data-theme="x"] resolves wherever the attribute
    // appears (not just <html>), so this local override is enough on its own.
    <div className="marketing min-h-screen bg-white" data-theme="indigo">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/executa-mark.svg" alt="Executa" width={24} height={24} />
            <span className="text-sm font-semibold text-slate-900">Executa</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-500">
            <a href="#features" className="hover:text-slate-900 transition-colors">Product</a>
            <a href="#ai-pm" className="hover:text-slate-900 transition-colors">AI PM</a>
            <a href="#pricing" className="hover:text-slate-900 transition-colors">Pricing</a>
            <a href="#security" className="hover:text-slate-900 transition-colors">Security</a>
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

      <section className="relative overflow-hidden bg-gradient-to-b from-accent-50/70 via-slate-50/60 to-white pt-16 pb-16">
        <div className="mesh-blob mesh-blob--a -top-24 -left-24 h-96 w-96 bg-violet-300" />
        <div className="mesh-blob mesh-blob--b top-10 right-0 h-[28rem] w-[28rem] bg-cyan-300" />
        <div className="mesh-blob mesh-blob--a bottom-0 left-1/3 h-72 w-72 bg-amber-200" />
        <div className="absolute inset-0 bg-dot-grid [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black_40%,transparent_100%)]" />
        <div className="relative z-10 max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-accent-700 bg-accent-50 border border-accent-200 rounded-full px-3 py-1 mb-5">
              <Sparkles size={12} /> AI-native project &amp; portfolio delivery
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-slate-900 leading-tight tracking-tight mb-5">
              From a first idea to a{" "}
              <span className="text-gradient-vivid">board-ready report</span>, without leaving one tracker.
            </h1>
            <p className="text-base text-slate-600 mb-8 max-w-lg">
              Executa is an AI-driven project and portfolio tracker for running your own team&apos;s
              engagements end to end — ideation, AI-drafted charters, sprints or waterfall
              phases, risk and budget tracking, and board-ready reports.
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <a
                href="#how-it-works"
                className="inline-block text-sm font-medium px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors bg-white/70"
              >
                See how it works
              </a>
              {!user && (
                <Link
                  href="/demand-request"
                  className="inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors bg-white/70"
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

      <Reveal>
        <section className="border-y border-slate-200 bg-white">
          <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            <StatCallout value="4" label="AI-assisted lifecycle gates" hue="violet" />
            <StatCallout value="7+" label="AI drafting surfaces" hue="blue" />
            <StatCallout value="2" label="Export formats, board-ready" hue="cyan" />
            <StatCallout value="1" label="Tracker, idea to report" hue="emerald" />
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="max-w-5xl mx-auto px-6 py-16">
          <HomeDemoCarousel />
        </section>
      </Reveal>

      <Reveal>
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
      </Reveal>

      <Reveal>
      <section id="features" className="relative overflow-hidden bg-slate-50 border-y border-slate-200 scroll-mt-16">
        <div className="mesh-blob mesh-blob--b top-0 right-1/4 h-80 w-80 bg-emerald-200 opacity-40" />
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-16">
          <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-2">What you get</p>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-10">Everything a boutique consultancy needs to run its own delivery.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <BentoCard
              hue="violet"
              icon={<Rocket size={18} />}
              title="Full project lifecycle"
              description="Ideation, charters, sprints or waterfall phases, tasks, risks, budgets, and ongoing support — one tracker from first idea to steady-state."
            />
            <BentoCard
              hue="blue"
              icon={<Sparkles size={18} />}
              title="An AI project manager"
              description="Drafts charters and plans, estimates effort, suggests assignments, briefs you out loud, and answers questions about your whole portfolio."
            />
            <BentoCard
              hue="cyan"
              icon={<FileSearch size={18} />}
              title="Vendor evaluation, built in"
              description="Draft an RFP from a project charter, invite vendors with a no-login link, and let AI score responses against your own weighted rubric."
            />
            <BentoCard
              hue="emerald"
              icon={<FileBarChart size={18} />}
              title="Reports that look the part"
              description="Branded, board-ready PDF and PowerPoint exports for status reports, steering committee decks, and executive one-pagers — generated on demand."
            />
            <BentoCard
              hue="amber"
              icon={<Inbox size={18} />}
              title="Demand intake, triaged"
              description="A public front door for raw project requests — AI scores business value and urgency before anything competes for a delivery slot."
            />
            <BentoCard
              hue="rose"
              icon={<ShieldCheck size={18} />}
              title="Governed, not just tracked"
              description="Role-based access, step-up MFA on sensitive actions, and an immutable audit log — built for teams handling client data and vendor spend."
            />
          </div>
        </div>
      </section>
      </Reveal>

      <Reveal>
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
      </Reveal>

      <Reveal>
      <section id="ai-pm" className="relative overflow-hidden bg-slate-900 scroll-mt-16">
        <div className="mesh-blob mesh-blob--a top-0 left-10 h-80 w-80 bg-violet-600 opacity-20" />
        <div className="mesh-blob mesh-blob--b bottom-0 right-10 h-96 w-96 bg-cyan-600 opacity-20" />
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-16">
          <p className="text-xs font-medium tracking-widest uppercase text-accent-400 mb-2">The AI project manager</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight mb-4 max-w-2xl">
            It doesn&apos;t just answer questions — it drafts the work.
          </h2>
          <p className="text-sm text-slate-400 max-w-2xl mb-10">
            A floating AI PM is available on every screen, with voice, and it&apos;s grounded in your
            actual portfolio data — not a generic chatbot bolted on top.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AiCapabilityCard
              hue="violet"
              icon={<Bot size={16} />}
              title="Drafts, not blank pages"
              description="Charters, RFPs, SOWs, delivery plans, risk logs, and status narratives generated from a one-line prompt, editable before anything is saved."
            />
            <AiCapabilityCard
              hue="blue"
              icon={<TrendingUp size={16} />}
              title="Estimates & recommends"
              description="Effort estimation, resource assignment suggestions, technical architecture recommendations, and delivery/pricing guidance sourced from your own rate cards."
            />
            <AiCapabilityCard
              hue="cyan"
              icon={<FileSearch size={16} />}
              title="Learns from your portfolio"
              description="Vendor scoring, SOW-vs-actuals drift detection, and cross-project pattern learning — grounded in what actually happened on past projects, not generic advice."
            />
            <AiCapabilityCard
              hue="emerald"
              icon={<Sparkles size={16} />}
              title="Ask it anything, out loud"
              description={"Natural-language Q&A across the whole portfolio or a single project, with a spoken briefing and captions — ask \"what needs my attention?\" and get a real answer."}
            />
            <AiCapabilityCard
              hue="amber"
              icon={<ShieldCheck size={16} />}
              title="Gated, not unchecked"
              description="AI-proposed edits go through a review-then-apply flow — you see the diff before anything changes, and every change lands in the audit log."
            />
            <AiCapabilityCard
              hue="rose"
              icon={<Rocket size={16} />}
              title="Roadmap-aware"
              description="Groups ideas into quick-wins vs. long-term investments, suggests prioritization, and reconciles conflicts when a roadmap is revised."
            />
          </div>
        </div>
      </section>
      </Reveal>

      {plans.length > 0 && (
        <Reveal>
        <section id="pricing" className="max-w-5xl mx-auto px-6 py-16 scroll-mt-16">
          <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-2 text-center">Pricing</p>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-10 text-center">
            Straightforward plans. Start on a free trial, upgrade when you&apos;re ready.
          </h2>
          <div className={`grid grid-cols-1 gap-5 ${plans.length === 2 ? "sm:grid-cols-2 max-w-2xl mx-auto" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {plans.map((p, i) => (
              <div
                key={p.id}
                className={`card-lift rounded-xl border p-6 flex flex-col ${
                  i === 1 ? "border-accent-300 shadow-md shadow-accent-600/10 relative" : "border-slate-200/70 shadow-sm shadow-slate-200/60"
                }`}
              >
                {i === 1 && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-gradient-to-r from-violet-600 via-accent-600 to-cyan-600 text-white shadow-sm">
                    Most popular
                  </span>
                )}
                <p className="text-sm font-semibold text-slate-900 mb-1">{p.name}</p>
                <p className="text-2xl font-semibold text-slate-900 mb-2">{formatPlanPrice(p)}</p>
                {p.description && <p className="text-xs text-slate-500 mb-4">{p.description}</p>}
                <div className="text-xs text-slate-500 space-y-1.5 mb-6">
                  <p className="flex items-center gap-1.5"><Check size={13} className="text-emerald-600 shrink-0" /> {p.projectLimit ? `${p.projectLimit} active projects` : "Unlimited projects"}</p>
                  <p className="flex items-center gap-1.5"><Check size={13} className="text-emerald-600 shrink-0" /> {p.seatLimit ? `${p.seatLimit} seats` : "Unlimited seats"}</p>
                  <p className="flex items-center gap-1.5"><Check size={13} className="text-emerald-600 shrink-0" /> AI project manager included</p>
                </div>
                <Link
                  href="/register"
                  className="mt-auto text-center text-sm font-medium px-4 py-2.5 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 transition-colors"
                >
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 text-center mt-8">
            Every new account starts on a free trial — no credit card required to sign up.
          </p>
        </section>
        </Reveal>
      )}

      <Reveal>
      <section id="security" className="bg-slate-50 border-y border-slate-200 scroll-mt-16">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-2">Security &amp; compliance</p>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-10 max-w-2xl">
            Built for teams that handle client data and vendor spend, not just to-do lists.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <SecurityRow hue="blue" icon={<ShieldCheck size={16} />} title="Role-based access" description="Every request is scoped to your organization and role at the API layer — Admin, Super User, PM, Contributor, Viewer." />
            <SecurityRow hue="violet" icon={<KeyRound size={16} />} title="Step-up MFA" description="TOTP verification required for Finance Approver and Platform-level roles on sensitive actions." />
            <SecurityRow hue="cyan" icon={<ScrollText size={16} />} title="Immutable audit log" description="Every approval, deletion, and rate change is recorded with before/after values and who made it." />
            <SecurityRow hue="emerald" icon={<Lock size={16} />} title="Self-service data control" description="Export or request deletion of your organization's data at any time, without waiting on support." />
          </div>
        </div>
      </section>
      </Reveal>

      <Reveal>
      <section className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-xs font-medium tracking-widest uppercase text-accent-600 mb-2 text-center">FAQ</p>
        <h2 className="text-xl font-semibold text-slate-900 tracking-tight mb-10 text-center">Common questions</h2>
        <div className="divide-y divide-slate-200 border-t border-b border-slate-200">
          {FAQS.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-slate-900 list-none">
                {item.q}
                <ArrowRight size={14} className="text-slate-400 transition-transform group-open:rotate-90 shrink-0 ml-4" />
              </summary>
              <p className="text-sm text-slate-500 leading-relaxed mt-3 pr-6">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
      </Reveal>

      <Reveal>
      <section className="relative overflow-hidden bg-gradient-to-r from-violet-700 via-accent-600 to-cyan-600">
        <div className="mesh-blob mesh-blob--a -top-16 left-1/4 h-72 w-72 bg-white opacity-10" />
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-14 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
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
      </Reveal>

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

type Hue = "violet" | "blue" | "cyan" | "emerald" | "amber" | "rose";

function StatCallout({ value, label, hue }: { value: string; label: string; hue: Hue }) {
  const gradients: Record<Hue, string> = {
    violet: "from-violet-600 to-violet-400",
    blue: "from-blue-600 to-blue-400",
    cyan: "from-cyan-600 to-cyan-400",
    emerald: "from-emerald-600 to-emerald-400",
    amber: "from-amber-600 to-amber-400",
    rose: "from-rose-600 to-rose-400",
  };
  return (
    <div>
      <p className={`text-2xl sm:text-3xl font-semibold bg-gradient-to-br bg-clip-text text-transparent ${gradients[hue]}`}>
        {value}
      </p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}

function BentoCard({ hue, icon, title, description }: { hue: Hue; icon: React.ReactNode; title: string; description: string }) {
  return (
    <div data-hue={hue} className="hue-edge card-lift rounded-xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/60 p-5">
      <div data-hue={hue} className="hue-chip h-9 w-9 mb-3">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-900 mb-1.5">{title}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
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

const DARK_HUE_TEXT: Record<Hue, string> = {
  violet: "text-violet-400",
  blue: "text-blue-400",
  cyan: "text-cyan-400",
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  rose: "text-rose-400",
};
const DARK_HUE_BG: Record<Hue, string> = {
  violet: "bg-violet-500/10",
  blue: "bg-blue-500/10",
  cyan: "bg-cyan-500/10",
  emerald: "bg-emerald-500/10",
  amber: "bg-amber-500/10",
  rose: "bg-rose-500/10",
};

function AiCapabilityCard({ hue, icon, title, description }: { hue: Hue; icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="card-lift rounded-xl border border-slate-700/70 bg-slate-800/60 p-5">
      <div className={`inline-flex items-center justify-center h-8 w-8 rounded-lg mb-3 ${DARK_HUE_BG[hue]} ${DARK_HUE_TEXT[hue]}`}>
        {icon}
      </div>
      <p className="text-sm font-semibold text-white mb-1.5">{title}</p>
      <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

function SecurityRow({ hue, icon, title, description }: { hue: Hue; icon: React.ReactNode; title: string; description: string }) {
  return (
    <div>
      <div data-hue={hue} className="hue-chip h-9 w-9 mb-3">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-900 mb-1.5">{title}</p>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}
