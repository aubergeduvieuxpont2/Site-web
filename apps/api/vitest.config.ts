import { defineConfig } from "vitest/config";

// `*.db.test.ts` files execute real SQL against Postgres and are excluded from
// the default run, so `npm test` stays fast and needs no database. Run them with
// `npm run test:db` locally (see test/db/harness.ts for the connection string),
// or via the CI job that provides a service container.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.db.test.ts"],
  },
});
