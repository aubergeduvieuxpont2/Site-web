import type { NeonQueryFunction } from "@neondatabase/serverless";

export interface AvailabilityNight {
  date: string; // "YYYY-MM-DD"
  available: number;
}

export interface AvailabilityResult {
  nights: AvailabilityNight[];
  unavailableNights: string[];
}

interface ReservationRow {
  arrive: string; // "YYYY-MM-DD"
  depart: string; // "YYYY-MM-DD"
  status: string;
  room_count: number | null;
  hold_expires_at: string | Date | null;
}

interface BlackoutRow {
  date: string; // "YYYY-MM-DD"
  rooms_blocked: string | number;
}

function dateRange(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const cur = new Date(checkIn + "T00:00:00Z");
  const end = new Date(checkOut + "T00:00:00Z");
  while (cur < end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export async function availabilityForRange(
  sql: NeonQueryFunction<any, any>,
  checkIn: string,
  checkOut: string,
  rooms: number,
  assignableRoomCount: number
): Promise<AvailabilityResult> {
  const now = new Date();

  // Fetch raw inputs in parallel: reservations overlapping the range (confirmed or
  // held) and blackout_dates within the range. Occupancy is then computed in
  // TypeScript so that active-hold semantics (hold_expires_at > now) can be
  // applied without a second round-trip.
  const [reservations, blackouts] = (await Promise.all([
    sql`
      SELECT
        to_char(arrive::date, 'YYYY-MM-DD') AS arrive,
        to_char(depart::date, 'YYYY-MM-DD') AS depart,
        status,
        room_count,
        hold_expires_at
      FROM reservations
      WHERE arrive::date < ${checkOut}::date
        AND depart::date > ${checkIn}::date
        AND status IN ('confirmed', 'held')
    `,
    sql`
      SELECT
        to_char(date, 'YYYY-MM-DD') AS date,
        rooms_blocked
      FROM blackout_dates
      WHERE date >= ${checkIn}::date AND date < ${checkOut}::date
    `,
  ])) as [ReservationRow[], BlackoutRow[]];

  const blackoutMap = new Map<string, number>();
  for (const b of blackouts) {
    blackoutMap.set(b.date, (blackoutMap.get(b.date) ?? 0) + Number(b.rooms_blocked));
  }

  const dates = dateRange(checkIn, checkOut);

  const nights: AvailabilityNight[] = dates.map((date) => {
    let occupied = 0;
    for (const r of reservations) {
      // arrive-inclusive, depart-exclusive boundary
      if (r.arrive > date || r.depart <= date) continue;
      const roomCount = Number(r.room_count ?? 1);
      if (r.status === "confirmed") {
        occupied += roomCount;
      } else if (
        r.status === "held" &&
        r.hold_expires_at != null &&
        new Date(r.hold_expires_at) > now
      ) {
        // An expired hold (hold_expires_at in the past) must not count — INV-hold-expiry-frees-inventory
        occupied += roomCount;
      }
    }
    const blocked = blackoutMap.get(date) ?? 0;
    return { date, available: Math.max(0, assignableRoomCount - occupied - blocked) };
  });

  const unavailableNights = nights
    .filter((n) => n.available < rooms)
    .map((n) => n.date);

  return { nights, unavailableNights };
}
