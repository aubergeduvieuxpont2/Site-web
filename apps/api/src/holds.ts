import type { Sql } from "./db";

export async function releaseExpiredHolds(
  sql: Sql
): Promise<{ released_count: number }> {
  const rows = (await sql`
    UPDATE reservations
    SET status = 'released'
    WHERE status = 'held' AND hold_expires_at < now()
    RETURNING id
  `) as { id: number }[];

  return { released_count: rows.length };
}
