import { defineConfig } from "vitest/config";

// Real-database tests only. Kept in a separate config so the default `npm test`
// never needs Postgres, and so these run with a longer timeout — the first test
// applies all migrations before anything else can proceed.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.db.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Migrations mutate shared schema; running files in parallel would race.
    fileParallelism: false,
  },
});
