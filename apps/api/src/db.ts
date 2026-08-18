import { neon } from "@neondatabase/serverless";
import postgres from "postgres";

/**
 * Database access for the Workers runtime.
 *
 * Two drivers, chosen at runtime, because Workers cannot open ordinary TCP
 * connections to Postgres:
 *
 *  - **Hyperdrive + postgres.js** (preferred). Hyperdrive fronts a TCP database
 *    — Aiven, RDS, anything — and pools connections at the edge. This is the
 *    target configuration.
 *  - **`neon()` over HTTP** (fallback). Neon's driver speaks HTTP, which is why
 *    it worked without Hyperdrive. Retained so this module can ship before the
 *    Hyperdrive binding exists, and so local dev and the migration runner keep
 *    working from a plain `DB_CONN` string.
 *
 * The binding is checked first, so cutover is a config change with no code
 * deploy: add the binding, and every call site switches at once.
 *
 * Why moving off Neon at all: Neon bills compute-time and its compute
 * autosuspends, so a cron that wakes the database on a schedule keeps it
 * billing continuously. A per-minute cron exhausted the quota in ~15 days and
 * returned HTTP 402 on every query, taking the whole API down. Aiven bills
 * instance + storage, so scheduled work is free.
 */

/** The subset of the environment this module needs. */
export interface DbEnv {
  /**
   * Cloudflare Hyperdrive binding. Named `aivendb` to match the binding name in
   * wrangler.jsonc — the operator keeps it aligned with the resource name shown
   * in the Cloudflare dashboard. This identifier is a contract between the
   * config and this file: renaming it in one place without the other silently
   * falls through to the DB_CONN branch below.
   */
  aivendb?: { connectionString: string };
  /** Direct Postgres connection string. Used for local dev and as a fallback. */
  DB_CONN?: string;
}

/**
 * A tagged-template query function.
 *
 * Deliberately matches `neon()`'s shape — returns the rows directly, not a
 * result wrapper — because ~170 call sites already depend on that shape.
 * `postgres.js` returns an array-like result, so both satisfy this without any
 * query being rewritten.
 */
export type Sql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<any[]>;

/**
 * Build a query function for this request.
 *
 * Call per request rather than caching at module scope: a Worker isolate is
 * reused across requests, and holding a postgres.js client across them would
 * pin a pooled connection. Hyperdrive makes acquiring one cheap.
 */
export function getSql(env: DbEnv): Sql {
  const hyperdriveUrl = env.aivendb?.connectionString;

  if (hyperdriveUrl) {
    // `max: 5` sizes the pool from THIS isolate to Hyperdrive. It is not a
    // slice of the origin database's connection cap: Hyperdrive owns the pool
    // to Aiven and multiplexes many isolates onto it, so Aiven's 20-connection
    // limit is not divided across isolates. The number that matters here is
    // how many queries one invocation may have in flight at once — 5 gives
    // headroom for concurrent queries within a request without holding
    // connections idle.
    //
    // If the aivendb binding is ever removed while a TCP database is still
    // in use, this reasoning no longer holds and the origin cap becomes a real
    // per-isolate constraint.
    //
    // `prepare: false` because pooled connections may be handed to a different
    // session than the one that prepared the statement.
    const sql = postgres(hyperdriveUrl, { max: 5, prepare: false });
    return ((strings: TemplateStringsArray, ...values: unknown[]) =>
      // postgres.js returns an array-like result; callers treat it as rows.
      (sql as unknown as (s: TemplateStringsArray, ...v: unknown[]) => Promise<any[]>)(
        strings,
        ...values,
      )) as Sql;
  }

  if (!env.DB_CONN) {
    throw new Error(
      "No database configured: neither the aivendb Hyperdrive binding nor DB_CONN is set.",
    );
  }

  // The fallback speaks Neon's HTTP protocol and CANNOT reach any other
  // Postgres. Fail loudly rather than handing a non-Neon URL to neon(), whose
  // failure surfaces as a generic 500 with nothing pointing at the cause.
  //
  // This exact situation cost hours during the Aiven cutover: a binding-name
  // mismatch made `env.aivendb` undefined, execution fell through to here with
  // DB_CONN pointing at Aiven, and every database-backed endpoint returned
  // "Internal server error" while the real problem was three characters in a
  // config file.
  // Only trips on a real remote host that is not Neon. Local and stub strings
  // (`postgres://stub`, `…@localhost:5432/…`) have no dotted hostname and pass
  // through, so unit tests and local dev are unaffected.
  const remoteHost = env.DB_CONN.match(/@([^/:?]+)/)?.[1] ?? "";
  if (remoteHost.includes(".") && !remoteHost.endsWith(".neon.tech")) {
    throw new Error(
      `Hyperdrive binding 'aivendb' is missing and DB_CONN points at ${remoteHost}, ` +
        "which is not a Neon host. The DB_CONN fallback uses Neon's HTTP driver " +
        "and cannot reach other Postgres providers. Check that the `hyperdrive` " +
        "binding name and id in wrangler.jsonc match a config listed by " +
        "`wrangler hyperdrive list`.",
    );
  }

  return neon(env.DB_CONN) as unknown as Sql;
}
