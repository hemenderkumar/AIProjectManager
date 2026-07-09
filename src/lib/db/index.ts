import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "[db] DATABASE_URL is not set. Set it in your environment (.env.local or Vercel project settings)."
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
