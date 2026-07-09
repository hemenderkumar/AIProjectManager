import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

function buildConnectionString(): string | undefined {
  // Preferred: a single DATABASE_URL.
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  // Fallback: build it from separate parts so the raw password never has to
  // be hand-encoded into a URL. Just paste the plain password into DB_PASSWORD.
  const host = process.env.DB_HOST;
  const password = process.env.DB_PASSWORD;
  if (host && password) {
    const user = process.env.DB_USER ?? "postgres";
    const port = process.env.DB_PORT ?? "5432";
    const database = process.env.DB_NAME ?? "postgres";
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
      password
    )}@${host}:${port}/${database}`;
  }

  return undefined;
}

const connectionString = buildConnectionString();

if (!connectionString) {
  console.warn(
    "[db] No database connection configured. Set DATABASE_URL, or set DB_HOST + DB_PASSWORD (+ optional DB_USER, DB_PORT, DB_NAME), in your environment."
  );
}

const client =
  global.__dbClient ??
  postgres(connectionString ?? "postgres://placeholder", {
    max: 1,
    ssl: connectionString?.includes("localhost") ? false : "require",
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  global.__dbClient = client;
}

export const db = drizzle(client, { schema });
