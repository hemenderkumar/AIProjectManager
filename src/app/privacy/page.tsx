export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-slate-200 p-8 space-y-6 text-sm text-slate-700 leading-relaxed">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          This is a template, not legal advice. It has not been reviewed by a lawyer. Before relying
          on this for a real product — especially if you handle data from the EU/UK (GDPR),
          California (CCPA/CPRA), or other regulated jurisdictions — have a licensed attorney review
          and customize it for your business and applicable law.
        </div>

        <div>
          <h1 className="text-lg font-semibold text-slate-900 mb-1">Privacy policy</h1>
          <p className="text-xs text-slate-400">Last updated: [DATE] · Replace bracketed placeholders before publishing.</p>
        </div>

        <section>
          <h2 className="font-medium text-slate-900 mb-1">1. What we collect</h2>
          <p>Account information (name, email, hashed password, role, and which organization you belong to), project data you or your team enter (tasks, budgets, risks, status updates, communications, rate cards, delivery/pricing details, support incidents), and basic usage logs (timestamps, IP address, browser type) needed to operate and secure the service. Sensitive actions — approvals, rate changes, role changes, and data export/deletion — are recorded in an internal audit log with the actor, timestamp, and a description of what changed.</p>
        </section>

        <section>
          <h2 className="font-medium text-slate-900 mb-1">2. How we use it</h2>
          <p>To operate the application, authenticate users, enforce organization-level data isolation, generate the reports and AI features you request, send status-request and report emails you configure, and maintain security and reliability. We do not sell personal data.</p>
        </section>

        <section>
          <h2 className="font-medium text-slate-900 mb-1">3. AI features</h2>
          <p>Optional AI features (project planning, charter drafting, technical recommendations, delivery/pricing recommendations, status reports, idea suggestions, the AI assistant) send relevant project data to Anthropic&apos;s API to generate a response. AI-generated content may be inaccurate or incomplete — it is provided for drafting assistance only and should be reviewed by a human before being relied upon for decisions.</p>
        </section>

        <section>
          <h2 className="font-medium text-slate-900 mb-1">4. Third parties / sub-processors</h2>
          <p>Vercel (hosting), a managed Postgres provider (database), Anthropic (AI features), and an email provider (status-request and scheduled report emails, if configured). Each processes data only as needed to provide their service to us.</p>
        </section>

        <section>
          <h2 className="font-medium text-slate-900 mb-1">5. Cookies</h2>
          <p>We use a single essential session cookie to keep you signed in. We do not use tracking or advertising cookies.</p>
        </section>

        <section>
          <h2 className="font-medium text-slate-900 mb-1">6. Multi-tenancy & data isolation</h2>
          <p>If your organization is one of several client companies using Keel through the same operator, your organization&apos;s projects, users, and incidents are scoped so that no other client organization can see them. Internal-only reference data (such as the operator&apos;s staffing roster and rate cards) is never shared with any client organization.</p>
        </section>

        <section>
          <h2 className="font-medium text-slate-900 mb-1">7. Data export & deletion</h2>
          <p>An organization owner (SUPER_USER) can export a full copy of their organization&apos;s data at any time from the &quot;My Organization&quot; page, and can request deletion of their organization&apos;s data from the same page. Deletion requests are reviewed and confirmed by a Keel administrator before anything is permanently deleted — this two-step process exists to prevent accidental or coerced data loss. You can cancel a pending deletion request at any time before it is confirmed. You can also reach hemender.kumar@gmail.com directly to request export or deletion.</p>
        </section>

        <section>
          <h2 className="font-medium text-slate-900 mb-1">8. Data retention</h2>
          <p>Data is retained while your account or organization is active, or until a deletion request is confirmed, subject to legal or operational retention requirements (for example, audit log entries referencing a deleted organization may be retained without personal identifiers for accountability purposes).</p>
        </section>

        <section>
          <h2 className="font-medium text-slate-900 mb-1">9. Your responsibilities</h2>
          <p>Don&apos;t enter sensitive personal data about third parties (e.g. health or financial data of people outside your organization) without a lawful basis and their awareness. You&apos;re responsible for the accuracy of data your team enters.</p>
        </section>

        <section>
          <h2 className="font-medium text-slate-900 mb-1">10. Security</h2>
          <p>We use industry-standard practices (encrypted connections, hashed passwords, role-based and organization-scoped access controls, an audit log for sensitive actions) but no system is 100% secure. Report suspected security issues to hemender.kumar@gmail.com.</p>
        </section>

        <section>
          <h2 className="font-medium text-slate-900 mb-1">11. Contact</h2>
          <p>Questions about this policy: hemender.kumar@gmail.com.</p>
        </section>
      </div>
    </div>
  );
}
