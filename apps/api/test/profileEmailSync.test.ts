import { describe, it, expect, vi } from "vitest";

// Swap the Neon stub per test via a holder (vi.mock is hoisted). Every query is
// routed by its SQL text so the verify-email happy path never touches a real
// database.
const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (...args: any[]) => neonHolder.sql(...args),
}));

import { app } from "../src/index";

// L12: the email-change -> HubSpot sync must ride the durable outbox by enqueuing
// a `contact.updateById` op at POST /ops/enqueue (NOT a direct, non-existent
// /ops/contact.updateById fetch that 404s), and must carry the Batch-1 shared
// secret in X-Internal-Auth or the gateway fails it closed with 401.
//
// M10: the sync now fires when the email change is CONFIRMED at the new address
// (POST /api/auth/verify-email, purpose="change"), not on the initial request —
// the old address is never silently reassigned. This test guards that guarantee
// at its new home.
describe("POST /api/auth/verify-email (change) -> HubSpot sync (L12)", () => {
  it("enqueues a contact.updateById op via /ops/enqueue with the shared secret", async () => {
    neonHolder.sql = (strings: TemplateStringsArray, ..._v: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("rate_limits")) return Promise.resolve([]); // limiter fails open
      if (q.includes("FROM email_verification_tokens")) {
        return Promise.resolve([
          { user_id: 7, purpose: "change", new_email: "new@example.com" },
        ]);
      }
      if (q.includes("lower(email)")) return Promise.resolve([]); // new email not taken
      if (q.includes("hubspot_contact_id")) {
        return Promise.resolve([{ hubspot_contact_id: "hs-123" }]);
      }
      return Promise.resolve([]); // UPDATE users, link, mark token used
    };

    const calls: Request[] = [];
    const HUBSPOT = {
      fetch: vi.fn(async (req: Request) => {
        calls.push(req);
        return new Response("{}", { status: 202 });
      }),
    };
    const env = {
      DB_CONN: "postgres://stub",
      HUBSPOT,
      GATEWAY_AUTH_SECRET: "gw-secret",
    } as any;

    const tasks: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (p: Promise<unknown>) => tasks.push(p),
      passThroughOnException: () => {},
    } as any;

    const res = await app.request(
      "http://localhost/api/auth/verify-email",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-connecting-ip": "1.2.3.4",
        },
        body: JSON.stringify({ token: "raw-token" }),
      },
      env,
      ctx,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      purpose: "change",
      email: "new@example.com",
    });

    // Let the fire-and-forget HubSpot sync (scheduled via waitUntil) settle.
    await Promise.all(tasks);

    expect(calls).toHaveLength(1);
    const req = calls[0];
    // Routed through the durable outbox enqueue path, NOT a direct op URL.
    expect(req.url).toBe("http://hubspot/ops/enqueue");
    expect(req.url).not.toContain("/ops/contact.updateById");
    expect(req.method).toBe("POST");
    // Batch-1 shared secret preserved so the gateway does not 401.
    expect(req.headers.get("X-Internal-Auth")).toBe("gw-secret");

    const body = (await req.json()) as any;
    expect(body.kind).toBe("contact.updateById");
    expect(body.payload.contactId).toBe("hs-123");
    expect(body.payload.properties.email).toBe("new@example.com");
    expect(body.dedupeKey).toBe("user-7-email-new@example.com");
  });
});
