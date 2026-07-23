import type { NeonQueryFunction } from "@neondatabase/serverless";

export async function releaseExpiredHolds(
  sql: NeonQueryFunction<any, any>
): Promise<{ released_count: number }> {
  const rows = (await sql`
    UPDATE reservations
    SET status = 'released'
    WHERE status = 'held' AND hold_expires_at < now()
    RETURNING id
  `) as { id: number }[];

  return { released_count: rows.length };
}
