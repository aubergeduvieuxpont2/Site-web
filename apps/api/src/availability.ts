import type { NeonQueryFunction } from "@neondatabase/serverless";

export interface AvailabilityNight {
  date: string; // "YYYY-MM-DD"
  available: number;
}

export interface AvailabilityResult {
  nights: AvailabilityNight[];
  unavailableNights: string[];
}

export async function availabilityForRange(
  sql: NeonQueryFunction<any, any>,
  checkIn: string,
  checkOut: string,
  rooms: number,
  assignableRoomCount: number
): Promise<AvailabilityResult> {
  const query = sql`
    SELECT
      to_char(d, 'YYYY-MM-DD') as date,
      GREATEST(0, ${assignableRoomCount} - COALESCE(confirmed_count, 0) - COALESCE(blocked_count, 0)) as available
    FROM (
      SELECT generate_series(${checkIn}::date, ${checkOut}::date - 1, '1 day') AS d
    ) dates
    LEFT JOIN (
      SELECT
        arrive::date + s as date,
        COUNT(*) as confirmed_count
      FROM reservations r,
        generate_series(0, (r.depart::date - r.arrive::date - 1)) as s
      WHERE r.status = 'confirmed'
        AND r.arrive::date < ${checkOut}::date
        AND r.depart::date > ${checkIn}::date
      GROUP BY arrive::date + s
    ) confirmed ON dates.d = confirmed.date
    LEFT JOIN (
      SELECT date, SUM(rooms_blocked) as blocked_count
      FROM blackout_dates
      WHERE date >= ${checkIn}::date AND date < ${checkOut}::date
      GROUP BY date
    ) blackout ON dates.d = blackout.date
    ORDER BY d;
  `;

  const rows = (await query) as { date: string; available: number }[];

  const nights: AvailabilityNight[] = rows.map((r) => ({
    date: r.date,
    available: r.available,
  }));

  const unavailableNights = nights
    .filter((n) => n.available < rooms)
    .map((n) => n.date);

  return {
    nights,
    unavailableNights,
  };
}
