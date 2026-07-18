// Durable, cross-isolate rate limiting backed by Neon Postgres (M1).
//
// The previous limiters used per-isolate in-memory Maps, so each Worker isolate
// tracked its own counts and an attacker spread across isolates was effectively
// unlimited. These helpers keep the counters in the `rate_limits` /
// `login_failures` tables (migration 0033) so every isolate shares one view.
//
// Fixed-window strategy: a window_start is the epoch-ms floor of `now` to the
// window size. The counter row is upserted atomically with ON CONFLICT ...
// DO UPDATE, so concurrent requests increment the same row without a race.
//
// `sql` is the tagged-template function returned by `neon(DB_CONN)`.

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>;

// The window used when *recording* a login failure. isAccountLocked accepts its
// own window for the "recent failures" sum, but new rows always bucket on this.
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function windowStartFor(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

/**
 * Atomically increment the counter for `bucketKey` in the current fixed window
 * and report whether the limit is now exceeded.
 *
 * Semantics match the old Map limiter: with limit=30, the first 30 requests are
 * allowed (returned counts 1..30) and the 31st (count 31 > 30) is blocked.
 */
export async function checkAndIncrement(
  sql: Sql,
  bucketKey: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<{ exceeded: boolean; count: number }> {
  const windowStart = windowStartFor(now, windowMs);
  const rows = await sql`
    INSERT INTO rate_limits (bucket_key, window_start, count)
    VALUES (${bucketKey}, ${windowStart}, 1)
    ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET count = rate_limits.count + 1
    RETURNING count
  `;
  const count = Number(rows?.[0]?.count ?? 0);
  return { exceeded: count > limit, count };
}

/**
 * Wrapper used by the middleware: returns true when the request should be
 * ALLOWED. Fails OPEN — a DB blip returns `true` (allow) rather than throwing,
 * so a transient database problem never takes the whole API down with 500s.
 */
export async function rateLimitAllow(
  sql: Sql,
  bucketKey: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<boolean> {
  try {
    const { exceeded } = await checkAndIncrement(sql, bucketKey, limit, windowMs, now);
    return !exceeded;
  } catch {
    // Fail open: allow the request. Nothing sensitive is logged.
    return true;
  }
}

/** Record one failed login for `email` in the current fixed window. */
export async function recordLoginFailure(sql: Sql, email: string, now: number): Promise<void> {
  const key = email.toLowerCase();
  const windowStart = windowStartFor(now, LOGIN_FAILURE_WINDOW_MS);
  await sql`
    INSERT INTO login_failures (email, window_start, count)
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (email, window_start)
    DO UPDATE SET count = login_failures.count + 1
  `;
}

/**
 * True when `email` has accumulated at least `threshold` failed logins within
 * the trailing `windowMs`. Sums across recent buckets so it is robust even if
 * failures straddle a window boundary.
 */
export async function isAccountLocked(
  sql: Sql,
  email: string,
  now: number,
  threshold: number,
  windowMs: number,
): Promise<boolean> {
  const key = email.toLowerCase();
  const cutoff = now - windowMs;
  const rows = await sql`
    SELECT COALESCE(SUM(count), 0) AS total
    FROM login_failures
    WHERE email = ${key} AND window_start > ${cutoff}
  `;
  const total = Number(rows?.[0]?.total ?? 0);
  return total >= threshold;
}

/** Clear a user's failed-login history (call on a successful login). */
export async function clearLoginFailures(sql: Sql, email: string): Promise<void> {
  const key = email.toLowerCase();
  await sql`DELETE FROM login_failures WHERE email = ${key}`;
}
