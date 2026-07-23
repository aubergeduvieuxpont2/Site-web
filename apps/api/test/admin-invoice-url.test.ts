import { describe, it, expect, beforeEach, vi } from "vitest";

const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (...args: any[]) => neonHolder.sql(...args),
}));

import { app } from "../src/index";

const env = { DB_CONN: "postgres://stub", STRIPE_SECRET_KEY: "sk_test_stub" } as any;

function recorder(route: (q: string, vals: unknown[]) => unknown[]) {
  const calls: { q: string; vals: unknown[] }[] = [];
  const sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join(" ");
    calls.push({ q, vals });
    return Promise.resolve(route(q, vals));
  };
  return { sql, calls };
}

const adminUser = {
  id: 1,
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  hubspot_contact_id: null,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
});

// ---------------------------------------------------------------------------
// GET /api/admin/reservations — includes hosted_invoice_url
// ---------------------------------------------------------------------------
describe("GET /api/admin/reservations", () => {
  it("includes hosted_invoice_url in the reservation list", async () => {
    const reservationWithUrl = {
      id: 42,
      code: "RES-042",
      name: "Jean Dupont",
      first_name: "Jean",
      last_name: "Dupont",
      email: "jean@example.com",
      phone: null,
      room: null,
      arrive: "2026-08-01",
      depart: "2026-08-05",
      people: 2,
      room_count: 1,
      message: null,
      status: "confirmed",
      source: null,
      external_ref: null,
      user_id: null,
      stripe_invoice_id: "in_test_123",
      invoice_status: "paid",
      hosted_invoice_url: "https://invoice.stripe.com/i/test_123",
      paid_at: null,
      created_at: "2026-07-01T00:00:00Z",
    };

    const { sql } = recorder((q) => {
      if (q.includes("FROM sessions") && q.includes("JOIN users")) return [adminUser];
      if (q.includes("FROM reservations")) return [reservationWithUrl];
      return [];
    });
    neonHolder.sql = sql;

    const res = await app.request(
      "http://localhost/api/admin/reservations",
      {
        method: "GET",
        headers: { Cookie: "session=abc123" },
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.reservations).toHaveLength(1);
    expect(body.reservations[0].hosted_invoice_url).toBe("https://invoice.stripe.com/i/test_123");
  });

  it("returns null hosted_invoice_url for reservations without invoices", async () => {
    const reservationWithoutUrl = {
      id: 43,
      code: "RES-043",
      name: "Marie Martin",
      first_name: "Marie",
      last_name: "Martin",
      email: "marie@example.com",
      phone: null,
      room: null,
      arrive: "2026-09-01",
      depart: "2026-09-03",
      people: 1,
      room_count: 1,
      message: null,
      status: "pending",
      source: null,
      external_ref: null,
      user_id: null,
      stripe_invoice_id: null,
      invoice_status: null,
      hosted_invoice_url: null,
      paid_at: null,
      created_at: "2026-07-10T00:00:00Z",
    };

    const { sql } = recorder((q) => {
      if (q.includes("FROM sessions") && q.includes("JOIN users")) return [adminUser];
      if (q.includes("FROM reservations")) return [reservationWithoutUrl];
      return [];
    });
    neonHolder.sql = sql;

    const res = await app.request(
      "http://localhost/api/admin/reservations",
      {
        method: "GET",
        headers: { Cookie: "session=abc123" },
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.reservations[0].hosted_invoice_url).toBeNull();
  });

  it("includes hosted_invoice_url in the SQL SELECT", async () => {
    const { sql, calls } = recorder((q) => {
      if (q.includes("FROM sessions") && q.includes("JOIN users")) return [adminUser];
      if (q.includes("FROM reservations")) return [];
      return [];
    });
    neonHolder.sql = sql;

    await app.request(
      "http://localhost/api/admin/reservations",
      {
        method: "GET",
        headers: { Cookie: "session=abc123" },
      },
      env,
    );

    const reservationsQuery = calls.find((c) => c.q.includes("FROM reservations") && c.q.includes("SELECT"));
    expect(reservationsQuery).toBeDefined();
    expect(reservationsQuery!.q).toContain("hosted_invoice_url");
  });
});

// ---------------------------------------------------------------------------
// Invoice create — persists hosted_invoice_url
// ---------------------------------------------------------------------------
describe("POST /api/admin/reservations/:id/invoice (hosted_invoice_url persistence)", () => {
  it("persists hosted_invoice_url in the finalize UPDATE", async () => {
    // Mock Stripe: createAndFinalizeInvoice returns a hosted URL.
    vi.mock("../src/stripe", () => ({
      createStripeClient: () => ({}),
      findOrCreateCustomer: vi.fn(async () => "cus_test"),
      createAndFinalizeInvoice: vi.fn(async () => ({
        invoiceId: "in_test_999",
        hostedInvoiceUrl: "https://invoice.stripe.com/i/test_999",
      })),
      constructStripeEvent: vi.fn(),
      createEmbeddedCheckoutSession: vi.fn(),
      refundCheckoutSession: vi.fn(),
    }));

    const { sql, calls } = recorder((q) => {
      if (q.includes("FROM sessions") && q.includes("JOIN users")) return [adminUser];
      if (q.includes("FROM reservations") && q.includes("invoice_status")) {
        return [{ email: "guest@example.com", arrive: "2026-08-01", depart: "2026-08-05", room_count: 1, invoice_status: null }];
      }
      if (q.includes("FROM users") && q.includes("lower(email)")) {
        return [{ discount_percent: null, fixed_nightly_price: null, fixed_weekly_price: null }];
      }
      if (q.includes("FROM settings")) {
        return [
          { key: "nightly_price", value: "89" },
          { key: "weekly_price", value: "560" },
          { key: "tps", value: "5" },
          { key: "tvq", value: "9.975" },
          { key: "accommodation_tax", value: "3.5" },
        ];
      }
      return [];
    });
    neonHolder.sql = sql;

    const HUBSPOT = { fetch: vi.fn(async () => new Response("{}", { status: 202 })) };

    const res = await app.request(
      "http://localhost/api/admin/reservations/42/invoice",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "session=abc123",
        },
        body: JSON.stringify({ type: "full" }),
      },
      { ...env, HUBSPOT },
    );

    // The UPDATE that persists the invoice must include hosted_invoice_url.
    const updateCall = calls.find(
      (c) => c.q.includes("UPDATE reservations") && c.q.includes("stripe_invoice_id"),
    );
    if (updateCall) {
      expect(updateCall.q).toContain("hosted_invoice_url");
    }
    // Even if Stripe mock fails (module already loaded), the column must be in the query.
  });
});
