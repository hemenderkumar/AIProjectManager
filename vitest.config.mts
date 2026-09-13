import { defineConfig } from "vitest/config";
import path from "node:path";

// Minimal, dependency-light config: no jsdom (everything under test is server-side
// logic -- auth, tenancy, billing -- not React components), and a hand-rolled alias
// entry mirroring tsconfig's "@/*" -> "./src/*" rather than pulling in
// vite-tsconfig-paths, since this is the only alias the app actually uses.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
