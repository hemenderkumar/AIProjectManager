import { vi } from "vitest";

type Row = Record<string, unknown>;

// A minimal stand-in for Drizzle's chainable query builder, used to unit-test the
// auth/tenancy/billing logic below without a real Postgres connection (this sandbox has
// none, and even in CI we don't want these tests depending on live data).
//
// Every builder method the functions under test call (select/from/where/leftJoin/orderBy/
// limit/update/set/insert/values/onConflictDoUpdate/returning) just returns the same
// `chain` object, so any call shape resolves regardless of exact chain length. `chain` is
// itself thenable: awaiting it pops the next array off a FIFO queue. Queue results in the
// exact order the function-under-test issues its queries (read the function top-to-bottom
// once to get the order right) and this reproduces real query-by-query behavior without
// reimplementing SQL.
export function createMockDb() {
  const queue: Row[][] = [];

  const chain: Record<string, unknown> = {};
  const chainable = [
    "select",
    "from",
    "where",
    "leftJoin",
    "innerJoin",
    "orderBy",
    "limit",
    "update",
    "set",
    "insert",
    "values",
    "onConflictDoUpdate",
    "returning",
  ];
  for (const method of chainable) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: Row[]) => void) => resolve(queue.length ? queue.shift()! : []);
  // Some call sites chain `.catch(() => {})` onto a best-effort write (e.g. bumping
  // lastLoginAt) so a transient failure never blocks the real result. The mock never rejects,
  // so this is just a no-op that keeps the chain callable the same way.
  chain.catch = vi.fn(() => chain);

  return {
    db: chain as unknown as typeof import("@/lib/db").db,
    // Queue the rows the next `await db...` call in source order should resolve to.
    queueResult(rows: Row[]) {
      queue.push(rows);
    },
  };
}
