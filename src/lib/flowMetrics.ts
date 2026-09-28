// Kanban flow metrics for the Sprint board -- cycle time, lead time, and a cumulative flow
// diagram computed from the task fields that already exist (createdAt, startedAt, completedAt,
// status), plus WIP-limit checking against a project's optional wipLimits column.
//
// There's no full status-history table in this app (see the comment on tasks.startedAt), so the
// CFD below is a proxy, not a true historical reconstruction: a task is treated as "To Do" from
// createdAt until startedAt, "In Progress" from startedAt until completedAt, and "Done" from
// completedAt onward. A task currently BLOCKED is bucketed with "In Progress" for the CFD (it
// has been started but isn't done) even though the board shows it in its own column -- good
// enough to see flow/accumulation trends without needing a new history table.

export type FlowTask = {
  id: string;
  status: string;
  createdAt: Date | string;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
};

const MS_PER_DAY = 86_400_000;

function toDate(v: Date | string | null): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

export type WipStatus = "IN_PROGRESS" | "BLOCKED";

export function computeWipUsage(tasks: FlowTask[], wipLimits: Record<string, number> | null | undefined) {
  const limits = wipLimits ?? {};
  const counts: Record<string, number> = {};
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  return (["IN_PROGRESS", "BLOCKED"] as WipStatus[])
    .filter((status) => limits[status] != null)
    .map((status) => ({
      status,
      count: counts[status] ?? 0,
      limit: limits[status] as number,
      overLimit: (counts[status] ?? 0) > (limits[status] as number),
    }));
}

export function computeCycleAndLeadTime(tasks: FlowTask[]) {
  const done = tasks.filter((t) => t.status === "DONE" && t.completedAt);
  const cycleTimes: number[] = [];
  const leadTimes: number[] = [];
  for (const t of done) {
    const completed = toDate(t.completedAt)!;
    const created = toDate(t.createdAt)!;
    leadTimes.push((completed.getTime() - created.getTime()) / MS_PER_DAY);
    const started = toDate(t.startedAt);
    if (started) {
      cycleTimes.push((completed.getTime() - started.getTime()) / MS_PER_DAY);
    }
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  return {
    avgCycleTimeDays: avg(cycleTimes),
    avgLeadTimeDays: avg(leadTimes),
    sampleSize: done.length,
    cycleTimeSampleSize: cycleTimes.length,
  };
}

export type CfdPoint = { date: string; todo: number; inProgress: number; done: number };

// Buckets task state by day for the last `days` days (default 30), based on the proxy
// createdAt/startedAt/completedAt transition points described above.
export function computeCumulativeFlow(tasks: FlowTask[], days = 30): CfdPoint[] {
  if (tasks.length === 0) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const points: CfdPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getTime() - i * MS_PER_DAY);
    const dayEnd = day.getTime() + MS_PER_DAY;
    let todo = 0;
    let inProgress = 0;
    let done = 0;
    for (const t of tasks) {
      const created = toDate(t.createdAt);
      if (!created || created.getTime() >= dayEnd) continue; // not created yet as of this day
      const started = toDate(t.startedAt);
      const completed = toDate(t.completedAt);
      if (completed && completed.getTime() < dayEnd) {
        done++;
      } else if (started && started.getTime() < dayEnd) {
        inProgress++;
      } else {
        todo++;
      }
    }
    points.push({ date: day.toISOString().slice(0, 10), todo, inProgress, done });
  }
  return points;
}
