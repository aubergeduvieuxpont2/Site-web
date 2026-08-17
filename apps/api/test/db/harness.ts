/**
 * Real-database test harness.
 *
 * Why this exists: the rest of the suite drives a mocked tagged template that
 * returns canned rows regardless of the SQL handed to it. That pins call shape
 * and ordering, but cannot observe whether Postgres would accept the statement
 * at all — which is how three defects reached production through a green suite
 * (untyped null parameter, ambiguous columns, and a timezone expression nothing
 * executed). Tests using this harness run the real SQL.
 *
 * Production code takes `sql` as a parameter, so nothing here requires changes
 * to it. `makeSql()` returns a tagged-template function with the same call
 * signature as `neon()`'s, backed by node-postgres.
 */
import { Client } from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "..", "..", "migrations");

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:55432/sitewebtest";

/**
 * A `neon()`-compatible tagged template over a pg Client.
 *
 * neon() interpolates values as $1..$n and returns rows directly (not a
 * QueryResult), so this mirrors both behaviours — otherwise tests would pass
 * against a shape production never sees.
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<any[]>;

export function makeSql(client: Client): SqlFn {
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce(
      (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""),
      "",
    );
    const res = await client.query(text, values as any[]);
    return res.rows;
  };
}

/** Apply every migration in order. They are idempotent, so re-running is safe. */
export async function applyMigrations(client: Client): Promise<number> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const sqlText = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    await client.query(sqlText);
  }
  return files.length;
}

/**
 * Connect, migrate once, and hand back a client plus its tagged template.
 *
 * Callers wrap each test in a transaction and roll it back (see `withRollback`)
 * so tests cannot see each other's writes and ordering never matters.
 */
export async function connectTestDb(): Promise<{
  client: Client;
  sql: SqlFn;
  migrationsApplied: number;
}> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const migrationsApplied = await applyMigrations(client);
  return { client, sql: makeSql(client), migrationsApplied };
}

/**
 * Run `fn` inside a transaction that is always rolled back, so a test can
 * insert fixtures freely without leaking into the next one.
 */
export async function withRollback(
  client: Client,
  fn: () => Promise<void>,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}
