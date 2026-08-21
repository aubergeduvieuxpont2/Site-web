/**
 * Real-database test harness.
 *
 * Why this exists: the rest of the suite drives a mocked tagged template that
 * returns canned rows regardless of the SQL handed to it. That pins call shape
 * and ordering, but cannot observe whether Postgres would accept the statement
 * at all — which is how several defects reached production through a green
 * suite. Tests using this harness run the real SQL.
 *
 * It uses **postgres.js, the same driver the Workers runtime uses**. That is
 * not incidental. An earlier version used node-postgres, which serialises
 * differently: handing `JSON.stringify(obj)` to a jsonb column stores an object
 * under `pg` but a JSON *string* under postgres.js. Testing against the wrong
 * driver hid exactly that bug, so the harness must track production's driver or
 * it gives false confidence.
 */
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "..", "..", "migrations");

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:55432/sitewebtest";

/**
 * A tagged-template query function, the same shape `getSql()` returns in
 * production: values interpolate as $1..$n and rows come back directly.
 */
export type SqlFn = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<any[]>;

/**
 * Minimal client surface the tests use for transaction control. `max: 1`
 * guarantees BEGIN/ROLLBACK land on the same connection as the queries between
 * them.
 */
export interface TestClient {
  query(text: string): Promise<unknown>;
  end(): Promise<void>;
}

/** Apply every migration in order. They are idempotent, so re-running is safe. */
export async function applyMigrations(
  sql: ReturnType<typeof postgres>,
): Promise<number> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    // .unsafe() runs a raw statement string; the tagged form would treat it as
    // a parameterised query.
    await sql.unsafe(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  }
  return files.length;
}

/**
 * Connect, migrate once, and hand back a client plus its tagged template.
 *
 * Callers wrap each test in a transaction and roll it back, so tests cannot see
 * each other's writes and ordering never matters.
 */
export async function connectTestDb(): Promise<{
  client: TestClient;
  sql: SqlFn;
  migrationsApplied: number;
}> {
  const pg = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  const migrationsApplied = await applyMigrations(pg);

  const client: TestClient = {
    query: (text: string) => pg.unsafe(text),
    end: () => pg.end(),
  };

  return {
    client,
    sql: pg as unknown as SqlFn,
    migrationsApplied,
  };
}

/**
 * Run `fn` inside a transaction that is always rolled back, so a test can
 * insert fixtures freely without leaking into the next one.
 */
export async function withRollback(
  client: TestClient,
  fn: () => Promise<void>,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}
