import { db } from "@/lib/db";
import { satisfactionSurveys, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import SatisfactionForm from "./SatisfactionForm";

export default async function SatisfactionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [survey] = await db.select().from(satisfactionSurveys).where(eq(satisfactionSurveys.token, token));

  if (!survey) {
    return (
      <Shell>
        <p className="text-sm text-slate-600">This link is invalid or has expired.</p>
      </Shell>
    );
  }

  if (survey.status === "COMPLETED") {
    return (
      <Shell>
        <p className="text-sm text-slate-600">Thanks — this feedback has already been recorded.</p>
      </Shell>
    );
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, survey.projectId));

  return (
    <Shell>
      {survey.respondentName && <p className="text-sm text-slate-500 mb-1">Hi {survey.respondentName},</p>}
      <h1 className="text-lg font-semibold text-slate-900 mb-1">
        Quick feedback — {project?.name ?? "your project"}
      </h1>
      <p className="text-sm text-slate-500 mb-4">Two questions, less than a minute. No login needed.</p>
      <SatisfactionForm token={token} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">{children}</div>
    </div>
  );
}
