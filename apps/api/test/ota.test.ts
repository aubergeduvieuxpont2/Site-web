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

  it("attaches X-Internal-Auth = GATEWAY_AUTH_SECRET on every op (T-API-002a)", async () => {
    const calls: Request[] = [];
    const fetcher = { fetch: vi.fn(async (req: Request) => { calls.push(req); return new Response("{}", { status: 202 }); }) } as any;
    await enqueueHubspotOps(
      fetcher,
      buildReservationHubspotOps({
        reservationId: 1, email: "a@b.co", firstName: "A", lastName: null,
        checkIn: null, checkOut: null, room: null, guests: 1, roomCount: 1, description: null,
      }),
      "gw-secret",
    );
    expect(calls).toHaveLength(2);
    for (const req of calls) {
      expect(req.headers.get("X-Internal-Auth")).toBe("gw-secret");
    }
  });

  it("swallows fetch errors", async () => {
    const fetcher = { fetch: vi.fn(async () => { throw new Error("down"); }) } as any;
    await expect(
      enqueueHubspotOps(fetcher, [{ kind: "contact.upsert", payload: { email: "a@b.co" } }]),
    ).resolves.toBeUndefined();
  });
});

import { OtaParsedSchema, OtaFailureSchema } from "../src/ota";

describe("OtaParsedSchema", () => {
  const parsed = {
    status: "parsed",
    source: "expedia",
    externalRef: "2511634261",
    subject: "Expedia - New Booking - Arriving on 5 Sep 2026",
    firstName: "Marie",
    lastName: "Gagnon",
    guestEmail: "abc@m.expediapartnercentral.com",
    phone: "1 1111111111",
    checkIn: "2026-09-05",
    checkOut: "2026-09-06",
    guests: 2,
    listingName: "Economy Double Room, River View - Standard",
  };

  it("accepts a full Expedia payload", () => {
    const r = OtaParsedSchema.safeParse(parsed);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.guestEmail).toBe("abc@m.expediapartnercentral.com");
  });

  it("accepts an Airbnb payload without email/phone/lastName", () => {
    const r = OtaParsedSchema.safeParse({
      status: "parsed",
      source: "airbnb",
      externalRef: "HM45MDTHZ4",
      firstName: "Jean",
      checkIn: "2026-07-30",
      checkOut: "2026-07-31",
      guests: 2,
      listingName: "Auberge du vieux pont",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.guestEmail).toBeNull();
      expect(r.data.lastName).toBeNull();
      expect(r.data.subject).toBe("");
    }
  });

  it("rejects checkOut on or before checkIn", () => {
    expect(OtaParsedSchema.safeParse({ ...parsed, checkOut: "2026-09-05" }).success).toBe(false);
    expect(OtaParsedSchema.safeParse({ ...parsed, checkOut: "2026-09-04" }).success).toBe(false);
  });

  it("rejects a malformed date and a missing externalRef", () => {
    expect(OtaParsedSchema.safeParse({ ...parsed, checkIn: "Sep 5, 2026" }).success).toBe(false);
    expect(OtaParsedSchema.safeParse({ ...parsed, externalRef: " " }).success).toBe(false);
  });

  it("defaults invalid guests to 1", () => {
    const r = OtaParsedSchema.safeParse({ ...parsed, guests: "abc" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.guests).toBe(1);
  });

  it("treats an empty guestEmail as absent (null), not invalid", () => {
    const r = OtaParsedSchema.safeParse({ ...parsed, guestEmail: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.guestEmail).toBeNull();
  });

  it("still rejects a malformed non-empty guestEmail", () => {
    expect(OtaParsedSchema.safeParse({ ...parsed, guestEmail: "not-an-email" }).success).toBe(false);
  });
});

describe("OtaFailureSchema", () => {
  it("accepts parse_failed and ignored reports", () => {
    expect(
      OtaFailureSchema.safeParse({ status: "parse_failed", provider: "airbnb", subject: "x", error: "no code" }).success,
    ).toBe(true);
    const r = OtaFailureSchema.safeParse({ status: "ignored", provider: "expedia" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.subject).toBe("");
      expect(r.data.error).toBeNull();
    }
  });

  it("rejects an unknown provider", () => {
    expect(OtaFailureSchema.safeParse({ status: "ignored", provider: "booking.com" }).success).toBe(false);
  });
});
