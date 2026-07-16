import { z } from "zod";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export const AssignRoomSchema = z.object({
  roomSlug: z.string().min(1),
});

export function reservationDatesValid(
  arrive: string | Date | null,
  depart: string | Date | null
): boolean {
  if (!arrive || !depart) return false;
  const arriveDate = parseDate(arrive);
  const departDate = parseDate(depart);
  if (!arriveDate || !departDate) return false;
  return departDate > arriveDate;
}

// The neon driver returns Postgres DATE columns as JS Date objects; accept
// both forms so a raw (non-to_char) SELECT can never throw here.
function parseDate(date: string | Date): Date | null {
  if (date instanceof Date) {
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

export async function isRoomFreeForRange(
  sql: NeonQueryFunction<any, any>,
  roomSlug: string,
  arrive: string,
  depart: string,
  excludeReservationId?: number
): Promise<boolean> {
  const result = (await sql`
    SELECT NOT EXISTS(
      SELECT 1 FROM reservation_room_assignments rra
      JOIN reservations r ON rra.reservation_id = r.id
      WHERE rra.room_slug = ${roomSlug}
      AND r.arrive < ${depart}::date
      AND r.depart > ${arrive}::date
      AND r.id != COALESCE(${excludeReservationId}, -1)
    ) as is_free
  `) as { is_free: boolean }[];
  return result.length > 0 && result[0]?.is_free === true;
}

export async function freeRoomsForRange(
  sql: NeonQueryFunction<any, any>,
  arrive: string,
  depart: string,
  excludeReservationId?: number
): Promise<{ slug: string; name: string }[]> {
  return (await sql`
    SELECT r.slug, r.name FROM rooms r
    WHERE NOT EXISTS (
      SELECT 1 FROM reservation_room_assignments rra
      JOIN reservations res ON rra.reservation_id = res.id
      WHERE rra.room_slug = r.slug
      AND res.arrive < ${depart}::date
      AND res.depart > ${arrive}::date
      AND res.id != COALESCE(${excludeReservationId}, -1)
    )
    ORDER BY r.name
  `) as { slug: string; name: string }[];
}
