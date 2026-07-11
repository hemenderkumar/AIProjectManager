import { db } from "@/lib/db";
import { statusRequests, projects, tasks, resources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import UpdateForm from "./UpdateForm";

export default async function UpdatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [reqRow] = await db.select().from(statusRequests).where(eq(statusRequests.token, token));

  if (!reqRow) {
    return (
      <Shell>
        <p className="text-sm text-slate-600">
          This link is invalid or has expired. Ask your project manager to send a new one.
        </p>
      </Shell>
    );
  }

  if (reqRow.status === "COMPLETED") {
    return (
      <Shell>
        <p className="text-sm text-slate-600">Thanks — this update has already been recorded.</p>
      </Shell>
    );
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, reqRow.projectId));
  const [task] = reqRow.taskId
    ? await db.select().from(tasks).where(eq(tasks.id, reqRow.taskId))
    : [null];
  const [resource] = await db.select().from(resources).where(eq(resources.id, reqRow.resourceId));

  return (
    <Shell>
      <p className="text-sm text-slate-500 mb-1">Hi {resource?.name ?? "there"},</p>
      <h1 className="text-lg font-semibold text-slate-900 mb-1">
        Quick status update — {project?.name}
      </h1>
      {task && <p className="text-sm text-slate-500 mb-4">Task: {task.title}</p>}
      <UpdateForm token={token} task={task} />
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
