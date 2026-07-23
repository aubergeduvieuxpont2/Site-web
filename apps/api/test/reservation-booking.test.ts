/**
 * Route-level tests for the reworked POST /api/reservations booking flow:
 * it now creates a 15-minute `held` reservation and starts an embedded Stripe
 * Checkout session, returning { reservationId, clientSecret, holdExpiresAt }.
 *
 * Mocked Stripe (no live keys) + the hoisted neon template-capture pattern.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () =>
    (strings: TemplateStringsArray, ...vals: unknown[]) =>
      neonHolder.sql(strings, ...vals),
}));

const { stripeHolder } = vi.hoisted(() => ({
  stripeHolder: {
    session: { sessionId: "cs_test_1", clientSecret: "cs_test_1_secret" },
  },
}));
vi.mock("../src/stripe", () => ({
  createStripeClient: () => ({}),
  createEmbeddedCheckoutSession: async () => stripeHolder.session,
  refundCheckoutSession: async () => ({ id: "re_1" }),
  constructStripeEvent: async () => ({}),
  createAndFinalizeInvoice: async () => ({ invoiceId: "in_1", hostedInvoiceUrl: null }),
  findOrCreateCustomer: async () => "cus_1",
}));

import { app } from "../src/index";

const HUBSPOT = { fetch: vi.fn(async () => new Response("{}", { status: 202 })) };
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;
const baseEnv = {
  DB_CONN: "postgres://stub",
  STRIPE_SECRET_KEY: "sk_test_stub",
  HUBSPOT,
  GATEWAY_AUTH_SECRET: "x",
} as any;

function post(env: any) {
  return app.request(
    "http://localhost/api/reservations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.2.3.4" },
      body: JSON.stringify({
        firstName: "Test",
        lastName: "Guest",
        email: "t@example.com",
        guests: 2,
        roomCount: 1,
        checkIn: "2027-01-10",
        checkOut: "2027-01-12",
      }),
    },
    env,
    ctx,
  );
}

describe("POST /api/reservations — hold + embedded checkout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 503 and creates no held row when STRIPE_SECRET_KEY is unset", async () => {
    let inserted = false;
    neonHolder.sql = (strings: TemplateStringsArray) => {
      if (strings.join(" ").includes("INSERT INTO reservations")) inserted = true;
      return Promise.resolve([]);
    };
    const res = await post({ ...baseEnv, STRIPE_SECRET_KEY: undefined });
    expect(res.status).toBe(503);
    expect(inserted).toBe(false);
  });

  it("returns 409 when the guarded insert finds no remaining capacity", async () => {
    // settings + availability probe return empty (available), but the guarded
    // INSERT returns no row — capacity was taken in a concurrent race.
    neonHolder.sql = () => Promise.resolve([]);
    const res = await post(baseEnv);
    expect(res.status).toBe(409);
  });

  it("returns 201 with reservationId, clientSecret and holdExpiresAt when the hold is created", async () => {
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("INSERT INTO reservations")) {
        return Promise.resolve([
          {
            id: 99,
            arrive: "2027-01-10",
            depart: "2027-01-12",
            hold_expires_at: "2027-01-10T00:15:00.000Z",
          },
        ]);
      }
      return Promise.resolve([]);
    };
    const res = await post(baseEnv);
    expect(res.status).toBe(201);
    const b = (await res.json()) as {
      reservationId: number;
      clientSecret: string;
      holdExpiresAt: string;
    };
    expect(b.reservationId).toBe(99);
    expect(b.clientSecret).toBe("cs_test_1_secret");
    expect(b.holdExpiresAt).toBeTruthy();
  });
});
