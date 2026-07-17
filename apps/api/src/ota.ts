/**
 * OTA (Airbnb/Expedia) email-ingest support shared by the public reservation
 * route and the internal /internal/ota-bookings endpoint.
 */

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

// A reservation with no usable guest email (Airbnb confirmations carry none)
// has nothing to sync: contact.upsert needs an email and deal.create resolves
// its contact by email.
export function buildReservationHubspotOps(input: ReservationSyncInput): HubspotOp[] {
  if (!input.email) return [];
  const deal: Record<string, unknown> = {
    contactEmail: input.email,
    dealname: `Reservation #${input.reservationId}`,
  };
  if (input.checkIn) deal.arrive = input.checkIn;
  if (input.checkOut) deal.depart = input.checkOut;
  if (input.room) deal.room = input.room;
  if (input.guests) deal.people = input.guests;
  if (input.roomCount != null) deal.roomCount = input.roomCount;
  if (input.description) deal.description = input.description;
  return [
    {
      kind: "contact.upsert",
      payload: {
        email: input.email,
        firstname: input.firstName,
        ...(input.lastName ? { lastname: input.lastName } : {}),
      },
    },
    { kind: "deal.create", payload: deal, dedupeKey: `reservation-${input.reservationId}` },
  ];
}

export async function enqueueHubspotOps(hubspot: Fetcher, ops: HubspotOp[]): Promise<void> {
  try {
    for (const op of ops) {
      await hubspot.fetch(
        new Request("http://hubspot/ops/enqueue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(op),
        }),
      );
    }
  } catch {
    // Best-effort, same policy as the existing reservation route: HubSpot
    // delivery failures must never fail the booking.
  }
}
