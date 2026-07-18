import { Hono, type Context } from "hono";
import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { User } from "./auth/session";
import { availabilityForRange, type AvailabilityNight } from "./availability";
import { rowsToAdminSettings } from "./settings";

type Bindings = { DB_CONN: string };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OccupancyRatios {
  currentMonth: number | null;
  previousMonth: number | null;
  sameMonthLastYear: number | null;
}

export interface DashboardResult {
  guestsThisWeek: number;
  guestsLastWeek: number;
  next7Days: AvailabilityNight[];
  occupancy: OccupancyRatios;
  returningCustomers: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** YYYY-MM-DD string from a Date in UTC. */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute occupied-room-nights ÷ (rooms × days).
 * Returns null when the denominator is 0 (no rooms or zero-day span).
 */
export function occupancyRatio(
  roomNights: string | null | undefined,
  rooms: number,
  days: number
): number | null {
  const denom = rooms * days;
  if (denom === 0) return null;
  const num = Number(roomNights ?? 0) || 0;
  return Math.round((num / denom) * 1000) / 1000;
}

/**
 * Derive the Monday–Sunday week bounds for a given date.
 * Returns { thisMonday, thisSunday, lastMonday, lastSunday } as Date objects.
 */
export function weekBounds(now: Date): {
  thisMonday: Date;
  thisSunday: Date;
  lastMonday: Date;
  lastSunday: Date;
} {
  const dayOfWeek = now.getUTCDay(); // 0=Sun … 6=Sat
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() - daysToMonday);
  thisMonday.setUTCHours(0, 0, 0, 0);

  const thisSunday = new Date(thisMonday);
  thisSunday.setUTCDate(thisMonday.getUTCDate() + 6);

  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);

  const lastSunday = new Date(thisMonday);
  lastSunday.setUTCDate(thisMonday.getUTCDate() - 1);

  return { thisMonday, thisSunday, lastMonday, lastSunday };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute the full admin dashboard payload for GET /api/admin/dashboard.
 *
 * Extracted from the inline handler so it can be unit-tested with fixture data.
 * The caller supplies `now` (defaults to current system time) so tests can pin
 * the date without mocking globals.
 */
export async function getDashboardData(
  sql: NeonQueryFunction<any, any>,
  assignableRoomCount: number,
  now: Date = new Date()
): Promise<DashboardResult> {
  const todayStr = toISODate(now);

  // ── Guests this week / last week ───────────────────────────────────────────
  const { thisMonday, thisSunday, lastMonday, lastSunday } = weekBounds(now);
  const thisMondayStr = toISODate(thisMonday);
  const thisSundayStr = toISODate(thisSunday);
  const lastMondayStr = toISODate(lastMonday);
  const lastSundayStr = toISODate(lastSunday);

  const weekRows = (await sql`
    SELECT
      SUM(CASE
        WHEN arrive::date <= ${thisSundayStr}::date AND depart::date > ${thisMondayStr}::date
        THEN people ELSE 0
      END) AS this_week,
      SUM(CASE
        WHEN arrive::date <= ${lastSundayStr}::date AND depart::date > ${lastMondayStr}::date
        THEN people ELSE 0
      END) AS last_week
    FROM reservations
    WHERE status = 'confirmed'
      AND (
        (arrive::date <= ${thisSundayStr}::date AND depart::date > ${thisMondayStr}::date)
        OR (arrive::date <= ${lastSundayStr}::date AND depart::date > ${lastMondayStr}::date)
      )
  `) as { this_week: string | null; last_week: string | null }[];

  const guestsThisWeek = Number(weekRows[0]?.this_week ?? 0) || 0;
  const guestsLastWeek = Number(weekRows[0]?.last_week ?? 0) || 0;

  // ── Next-7-days availability ───────────────────────────────────────────────
  const next7End = new Date(now);
  next7End.setUTCDate(now.getUTCDate() + 7);
  const next7EndStr = toISODate(next7End);
  const next7 = await availabilityForRange(sql, todayStr, next7EndStr, 1, assignableRoomCount);

  // ── Occupancy ratios ───────────────────────────────────────────────────────
  // Current month: [first of month, today] month-to-date.
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const firstOfMonthStr = toISODate(firstOfMonth);
  const dayOfMonth = now.getUTCDate(); // 1-based, equals number of days in MTD span

  // Same day-count span for the previous month.
  // Cap dayOfMonth at the last day of that month (e.g. March 31 → Feb 28/29).
  const prevYear = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const prevMonth = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
  const prevMonthLastDay = new Date(Date.UTC(prevYear, prevMonth + 1, 0)).getUTCDate();
  const prevDayOfMonth = Math.min(dayOfMonth, prevMonthLastDay);
  const prevMonthFirst = new Date(Date.UTC(prevYear, prevMonth, 1));
  const prevMonthEnd = new Date(Date.UTC(prevYear, prevMonth, prevDayOfMonth));
  const prevMonthFirstStr = toISODate(prevMonthFirst);
  const prevMonthEndStr = toISODate(prevMonthEnd);

  // Same day-count span for the same month last year.
  // Cap at last day of that month (handles Feb 29 in leap years vs. non-leap).
  const lyYear = now.getUTCFullYear() - 1;
  const lyMonthLastDay = new Date(Date.UTC(lyYear, now.getUTCMonth() + 1, 0)).getUTCDate();
  const lyDayOfMonth = Math.min(dayOfMonth, lyMonthLastDay);
  const lyMonthFirst = new Date(Date.UTC(lyYear, now.getUTCMonth(), 1));
  const lyMonthEnd = new Date(Date.UTC(lyYear, now.getUTCMonth(), lyDayOfMonth));
  const lyMonthFirstStr = toISODate(lyMonthFirst);
  const lyMonthEndStr = toISODate(lyMonthEnd);

  type OccRow = { room_nights: string | null };

  const [occCurrent, occPrev, occLY] = await Promise.all([
    sql`
      SELECT SUM(
        COALESCE(room_count, 1) *
        (LEAST(depart::date, ${todayStr}::date + 1) - GREATEST(arrive::date, ${firstOfMonthStr}::date))
      ) AS room_nights
      FROM reservations
      WHERE status = 'confirmed'
        AND arrive::date <= ${todayStr}::date
        AND depart::date > ${firstOfMonthStr}::date
    ` as unknown as Promise<OccRow[]>,
    sql`
      SELECT SUM(
        COALESCE(room_count, 1) *
        (LEAST(depart::date, ${prevMonthEndStr}::date + 1) - GREATEST(arrive::date, ${prevMonthFirstStr}::date))
      ) AS room_nights
      FROM reservations
      WHERE status = 'confirmed'
        AND arrive::date <= ${prevMonthEndStr}::date
        AND depart::date > ${prevMonthFirstStr}::date
    ` as unknown as Promise<OccRow[]>,
    sql`
      SELECT SUM(
        COALESCE(room_count, 1) *
        (LEAST(depart::date, ${lyMonthEndStr}::date + 1) - GREATEST(arrive::date, ${lyMonthFirstStr}::date))
      ) AS room_nights
      FROM reservations
      WHERE status = 'confirmed'
        AND arrive::date <= ${lyMonthEndStr}::date
        AND depart::date > ${lyMonthFirstStr}::date
    ` as unknown as Promise<OccRow[]>,
  ]);

  const occupancy: OccupancyRatios = {
    currentMonth: occupancyRatio(occCurrent[0]?.room_nights, assignableRoomCount, dayOfMonth),
    previousMonth: occupancyRatio(occPrev[0]?.room_nights, assignableRoomCount, prevDayOfMonth),
    sameMonthLastYear: occupancyRatio(occLY[0]?.room_nights, assignableRoomCount, lyDayOfMonth),
  };

  // ── Returning customers ────────────────────────────────────────────────────
  // Distinct guests (keyed by user_id else lower(email)) with ≥ 2 confirmed stays.
  const rcRows = (await sql`
    SELECT COUNT(*) AS count FROM (
      SELECT COALESCE(user_id::text, lower(email)) AS guest_key
      FROM reservations
      WHERE status = 'confirmed'
      GROUP BY COALESCE(user_id::text, lower(email))
      HAVING COUNT(*) >= 2
    ) sub
  `) as { count: string }[];
  const returningCustomers = Number(rcRows[0]?.count ?? 0) || 0;

  return {
    guestsThisWeek,
    guestsLastWeek,
    next7Days: next7.nights,
    occupancy,
    returningCustomers,
  };
}

// ── Hono router factory ───────────────────────────────────────────────────────
// Wire into index.ts with:
//   app.route("/", createDashboardRouter({ authenticate: getAuthUser }));

export function createDashboardRouter(deps: {
  authenticate: (c: Context<{ Bindings: Bindings }>) => Promise<User | null>;
}) {
  const router = new Hono<{ Bindings: Bindings }>();

  router.get("/api/admin/dashboard", async (c) => {
    const user = await deps.authenticate(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

    const sql = neon(c.env.DB_CONN);

    // Fetch settings for assignableRoomCount.
    const settingsRows = (await sql`SELECT key, value FROM settings`) as {
      key: string;
      value: string;
    }[];
    const { assignableRoomCount } = rowsToAdminSettings(settingsRows);

    const data = await getDashboardData(sql, assignableRoomCount);
    return c.json(data);
  });

  return router;
}
