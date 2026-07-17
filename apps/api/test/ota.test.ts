import { describe, it, expect, vi } from "vitest";
import { buildReservationHubspotOps, enqueueHubspotOps } from "../src/ota";

describe("buildReservationHubspotOps", () => {
  const base = {
    reservationId: 42,
    email: "guest@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    checkIn: "2026-08-01",
    checkOut: "2026-08-03",
    room: "Refuge du Rider",
    guests: 2,
    roomCount: 1,
    description: "Merci",
  };

  it("builds a contact.upsert and a deduped deal.create", () => {
    const ops = buildReservationHubspotOps(base);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({
      kind: "contact.upsert",
      payload: { email: "guest@example.com", firstname: "Ada", lastname: "Lovelace" },
    });
    expect(ops[1].kind).toBe("deal.create");
    expect(ops[1].dedupeKey).toBe("reservation-42");
    expect(ops[1].payload).toEqual({
      contactEmail: "guest@example.com",
      dealname: "Reservation #42",
      arrive: "2026-08-01",
      depart: "2026-08-03",
      room: "Refuge du Rider",
      people: 2,
      roomCount: 1,
      description: "Merci",
    });
  });

  it("omits null optional fields from the deal payload", () => {
    const ops = buildReservationHubspotOps({
      ...base,
      checkIn: null,
      checkOut: null,
      room: null,
      description: null,
      roomCount: null,
    });
    expect(ops[1].payload).toEqual({
      contactEmail: "guest@example.com",
      dealname: "Reservation #42",
      people: 2,
    });
  });

  it("returns no ops when there is no guest email (Airbnb case)", () => {
    expect(buildReservationHubspotOps({ ...base, email: null })).toEqual([]);
    expect(buildReservationHubspotOps({ ...base, email: "" })).toEqual([]);
  });
});

describe("enqueueHubspotOps", () => {
  it("POSTs each op to /ops/enqueue on the binding", async () => {
    const calls: Request[] = [];
    const fetcher = { fetch: vi.fn(async (req: Request) => { calls.push(req); return new Response("{}", { status: 202 }); }) } as any;
    await enqueueHubspotOps(fetcher, buildReservationHubspotOps({
      reservationId: 1, email: "a@b.co", firstName: "A", lastName: null,
      checkIn: null, checkOut: null, room: null, guests: 1, roomCount: 1, description: null,
    }));
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("http://hubspot/ops/enqueue");
    expect(calls[0].method).toBe("POST");
    const body = await calls[0].json();
    expect(body.kind).toBe("contact.upsert");
  });

  it("swallows fetch errors", async () => {
    const fetcher = { fetch: vi.fn(async () => { throw new Error("down"); }) } as any;
    await expect(
      enqueueHubspotOps(fetcher, [{ kind: "contact.upsert", payload: { email: "a@b.co" } }]),
    ).resolves.toBeUndefined();
  });
});
