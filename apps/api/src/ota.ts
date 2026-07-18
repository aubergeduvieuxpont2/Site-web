/**
 * OTA (Airbnb/Expedia) email-ingest support shared by the public reservation
 * route and the internal /internal/ota-bookings endpoint.
 */

import { z } from "zod";
import { reservationDatesValid } from "./assignments";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const trimToNull = z
  .string()
  .nullish()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : null;
  });

export const OtaParsedSchema = z
  .object({
    status: z.literal("parsed"),
    source: z.enum(["airbnb", "expedia"]),
    externalRef: z.string().trim().min(1),
    subject: z.string().optional().default(""),
    firstName: z.string().trim().min(1),
    lastName: trimToNull,
    // Empty/whitespace guestEmail (common for Airbnb, sometimes for Expedia)
    // must not 400 the whole booking: trim, treat "" as absent, then still
    // validate any non-empty value as a real email.
    guestEmail: z
      .preprocess((v) => {
        if (typeof v !== "string") return v ?? null;
        const t = v.trim();
        return t.length > 0 ? t : null;
      }, z.string().email().nullish())
      .transform((v) => v ?? null),
    phone: trimToNull,
    checkIn: z.string().regex(DATE_RE),
    checkOut: z.string().regex(DATE_RE),
    guests: z.coerce.number().int().min(1).catch(1),
    listingName: trimToNull,
  })
  .superRefine((d, ctx) => {
    if (!reservationDatesValid(d.checkIn, d.checkOut)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkOut"],
        message: "checkOut must be after checkIn",
      });
    }
  });

export const OtaFailureSchema = z.object({
  status: z.enum(["parse_failed", "ignored"]),
  provider: z.enum(["airbnb", "expedia"]),
  subject: z.string().optional().default(""),
  error: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
});

export type OtaParsed = z.infer<typeof OtaParsedSchema>;

export type HubspotOp = {
  kind: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
};

export type ReservationSyncInput = {
  reservationId: number;
  email: string | null;
  firstName: string;
  lastName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  room: string | null;
  guests: number;
  roomCount: number | null;
  description: string | null;
};

// OTA free-text (guest name, listing name, externalRef-bearing message) arrives
// from booking emails WITHOUT authentication, so it must never reach the CRM
// verbatim: strip control characters and markup (`<>`) that downstream HubSpot
// rendering could misinterpret, collapse the residue, and length-cap it. Returns
// null for empty/absent input so optional fields stay omitted from the payload.
export function sanitizeHubspotText(
  value: string | null | undefined,
  maxLen: number,
): string | null {
  if (value == null) return null;
  const cleaned = value
    // Drop C0/C1 control characters (incl. NUL, newlines, tabs, DEL).
    .replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
    // Drop angle brackets so no markup/tag survives into CRM rendering.
    .replace(/[<>]/g, "")
    // Collapse the whitespace left behind by the substitutions.
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, maxLen);
}

// A reservation with no usable guest email (Airbnb confirmations carry none)
// has nothing to sync: contact.upsert needs an email and deal.create resolves
// its contact by email.
export function buildReservationHubspotOps(input: ReservationSyncInput): HubspotOp[] {
  if (!input.email) return [];
  // Sanitize every unauthenticated OTA free-text field before it becomes a
  // HubSpot property. The reservation DB row keeps the raw values; only the CRM
  // payload is neutralized here.
  const firstName = sanitizeHubspotText(input.firstName, 200) ?? "";
  const lastName = sanitizeHubspotText(input.lastName, 200);
  const room = sanitizeHubspotText(input.room, 200);
  const description = sanitizeHubspotText(input.description, 500);

  const deal: Record<string, unknown> = {
    contactEmail: input.email,
    dealname: `Reservation #${input.reservationId}`,
  };
  if (input.checkIn) deal.arrive = input.checkIn;
  if (input.checkOut) deal.depart = input.checkOut;
  if (room) deal.room = room;
  if (input.guests) deal.people = input.guests;
  if (input.roomCount != null) deal.roomCount = input.roomCount;
  if (description) deal.description = description;
  return [
    {
      kind: "contact.upsert",
      payload: {
        email: input.email,
        firstname: firstName,
        ...(lastName ? { lastname: lastName } : {}),
      },
    },
    { kind: "deal.create", payload: deal, dedupeKey: `reservation-${input.reservationId}` },
  ];
}

export async function enqueueHubspotOps(
  hubspot: Fetcher,
  ops: HubspotOp[],
  authSecret?: string,
): Promise<void> {
  try {
    for (const op of ops) {
      await hubspot.fetch(
        new Request("http://hubspot/ops/enqueue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Auth": authSecret ?? "",
          },
          body: JSON.stringify(op),
        }),
      );
    }
  } catch {
    // Best-effort, same policy as the existing reservation route: HubSpot
    // delivery failures must never fail the booking.
  }
}
