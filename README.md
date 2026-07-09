# KPI Project Tracker

An AI-driven, KPI-driven project portfolio tracker that acts like an AI project manager —
not just a place you go update, but an agent that plans work, assigns tasks, chases people
for status, and briefs you (in text and in voice) whenever you ask.

## What's inside

- **Portfolio dashboard** — KPI cards, RAG health breakdown, stage funnel, budget rollups by
  country and program, and a "needs attention" list, all computed automatically.
- **Automated health scoring** — a rule-based engine (`src/lib/kpi.ts`) computes each project's
  RAG status from schedule slippage, budget overrun, overdue tasks, and open high-severity risks.
- **AI PM agent** — give it a goal on the Tasks tab and it drafts milestones, breaks the work into
  tasks with effort estimates, and suggests who on your team should own each one based on their
  role. It also keeps its own running list of follow-ups ("AI PM follow-ups") — things like
  chasing someone for an update or prepping a steering deck.
- **Status requests, no login needed** — click the mail icon next to any task to generate a
  one-time link (emailed automatically if you add a Resend API key, otherwise copied to your
  clipboard). The assignee fills in a tiny form — no account required — and it flows straight
  into the task and status history.
- **Scheduled reporting** — weekly status reports and steering-committee packs, generated
  automatically on a cadence you set in Admin (or on demand from the Reports tab), and emailed to
  Admins/PMs if you've configured email.
- **Talking AI PM avatar** — a small animated assistant in the corner of every page. It speaks
  using your browser's built-in text-to-speech (no API key, no cost) and always shows the same
  text as on-screen captions, so it works even if audio is off — no microphone or camera
  permission is ever requested, since it only speaks, it doesn't listen.
- **Roles & admin** — Admin/PM/Contributor/Viewer roles, an Admin tab to create users, assign
  roles, and grant specific people access to specific projects.
- **Full lifecycle per project** — Inception & Ideation, Project Charter (with AI-drafted
  charter), Tasks, Resources, Status Tracking, Communications, Risks, Milestones, and a C-Level
  Report tab.
- **Privacy Policy & Terms pages** — see the legal note below before you rely on these.

## Tech stack

Next.js 16 (App Router, TypeScript), Tailwind CSS, Drizzle ORM + PostgreSQL, Recharts, the
Anthropic SDK for AI features, and the browser's native Web Speech API for the avatar's voice.
Deploys to Vercel with any managed Postgres provider.

## 1. Run it locally

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and AUTH_SECRET at minimum
npm run db:migrate           # applies the schema to your database
npm run seed                 # sample projects + a seeded admin login
npm run dev                  # http://localhost:3000
```

You need a Postgres database — the fastest free option is [Neon](https://neon.tech) or
[Supabase](https://supabase.com); copy its connection string into `DATABASE_URL`.

For `AUTH_SECRET`, generate one with `openssl rand -base64 32` and paste it in.

**Log in** with the seeded admin account: `admin@example.com` / `changeme123` (or whatever you
set via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` before seeding). Change this password via the
Admin tab, or re-seed with your own values, before using this for anything real.

## 2. Push to GitHub

```bash
cd kpi-tracker
git init
git add .
git commit -m "Initial commit: KPI project tracker"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## 3. Deploy to Vercel

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Add a Postgres database under **Storage → Create Database** (Vercel Postgres via Neon), or
   connect your own — either way, set `DATABASE_URL` under **Project Settings → Environment
   Variables** if it isn't set automatically.
3. Add `AUTH_SECRET` (a random string — required, sessions won't work without it).
4. Optional: `ANTHROPIC_API_KEY` for AI planning/charters/reports/assistant. Without it, those
   features show a friendly "not configured" message instead of erroring.
5. Optional: `RESEND_API_KEY` and `EMAIL_FROM` to actually send status-request and report emails.
   Without it, the app still generates shareable links — you just have to send them yourself.
6. Set `CRON_SECRET` (any random string) if you want the scheduled weekly report and steering
   committee pack (`vercel.json`) to run — this authenticates Vercel's cron caller.
7. Deploy. Then run migrations and seed against production once:
   ```bash
   vercel env pull .env.production.local
   DATABASE_URL=$(grep DATABASE_URL .env.production.local | cut -d '=' -f2-) npm run db:migrate
   DATABASE_URL=$(grep DATABASE_URL .env.production.local | cut -d '=' -f2-) npm run seed
   ```
8. Visit your `*.vercel.app` URL, or attach a custom domain/subdomain under **Project Settings →
   Domains**.

**Note on Vercel Cron**: the Hobby (free) plan limits how many cron jobs you can run and how
often. `vercel.json` schedules the weekly report for Mondays and the steering pack monthly —
both comfortably within Hobby limits, but check Vercel's current cron limits for your plan if
you change the schedule.

## 4. Configure automation (Admin tab)

Log in as an Admin and go to **Admin** to:
- Create users and set their role (Admin, PM, Contributor, Viewer)
- Set the cadence for weekly status reports and steering committee packs (or leave on Manual and
  generate them on demand from **Reports**)
- Choose the avatar's voice (female/male) — this picks a matching browser voice when available

## Database schema

Defined in `src/lib/db/schema.ts` using Drizzle: `projects` (carries inception, ideation, charter,
and country/program fields directly), `tasks` (with `isAgentTask`/`createdByAi` flags for AI PM
follow-ups and AI-generated tasks), `resources`, `project_resources`, `status_updates`,
`communication_logs`, `risk_items`, `milestones`, `users`, `project_members`, `status_requests`,
`reports`, `settings`.

To change the schema: edit `schema.ts`, run `npm run db:generate` to create a new migration, then
`npm run db:migrate` to apply it.

## AI features & how they work

All AI calls go through `src/lib/ai.ts` using your server-side `ANTHROPIC_API_KEY` — never exposed
to the browser.

- `POST /api/ai/ask` — answers a question using a live snapshot of the portfolio.
- `POST /api/ai/plan-project` — the AI PM: turns a goal into milestones, tasks with effort
  estimates and suggested assignees, and its own follow-up list.
- `POST /api/ai/generate-charter` — drafts a charter from ideation notes.
- `POST /api/ai/generate-report` — on-demand executive report (project or portfolio-wide).
- `/api/cron/weekly-report` and `/api/cron/steering-committee` — scheduled versions of the above,
  stored in the `reports` table and emailed to Admins/PMs if email is configured.

The RAG/health scoring on the dashboard is rule-based (`src/lib/kpi.ts`) and needs no API key.

## The talking avatar

`src/components/AvatarAssistant.tsx` uses the browser's built-in `speechSynthesis` API — free,
no API key, no server round-trip for the voice itself. It only *speaks* (output), so it never
asks for microphone or camera permission. Every spoken response is shown as on-screen text at the
same time, so it's fully usable with sound off.

## Legal pages — read this

`/privacy` and `/terms` are included as a starting template with standard SaaS clauses (data
handling, third-party processors, AI-content disclaimer, liability limits). **This is not legal
advice, and it has not been reviewed by a lawyer.** Replace the bracketed placeholders and have a
licensed attorney review and adapt both pages — especially around GDPR/CCPA if you'll handle data
from the EU/UK or California — before relying on them for a real product.

## Project structure

```
src/
  app/
    (app)/layout.tsx        Route-group layout: redirects to /login if not authenticated, adds Sidebar + avatar
    login/                 Login page
    dashboard/              Portfolio KPI dashboard + country/program rollups
    projects/               Project list + "new project" form
    projects/[id]/          Project detail (tabs for every lifecycle stage)
    admin/                  User management + automation settings (Admin role only)
    reports/                Weekly status / steering committee report history + generate now
    ai/                     Standalone AI assistant + portfolio report page
    update/[token]/         Public, no-login status-update form for task assignees
    privacy/, terms/        Legal pages (see note above)
    api/                    REST endpoints — projects, tasks, admin, AI, status-requests, cron
  components/               Shared UI, AvatarAssistant, per-tab project components
  lib/
    db/                     Drizzle schema, client, seed script
    kpi.ts                  Rule-based health scoring engine
    portfolio.ts             Data-fetching + metric rollups
    ai.ts                    Anthropic client wrapper
    auth.ts                  Password hashing, session tokens, role checks
    email.ts                 Resend wrapper (no-op if RESEND_API_KEY isn't set)
    reportGenerator.ts        Shared logic for weekly/steering report generation + emailing
```
