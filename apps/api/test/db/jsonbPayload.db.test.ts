// @vitest-environment node
/**
 * jsonb payloads must round-trip as OBJECTS.
 *
 * The outbox inserts used `JSON.stringify(payload)`, which Neon's HTTP driver
 * parsed into jsonb. postgres.js does not: it stores a JSON *string*, so every
 * field reads back undefined. That shipped silently after the Hyperdrive
 * migration — queued emails carried unusable payloads, and HubSpot rejected
 * its search filter with "operator EQ requires a value".
 *
 * A `::jsonb` cast does not help, which is the counter-intuitive part and the
 * reason this needs a real database to assert rather than a mock.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { TestClient } from "./harness";
import { connectTestDb, type SqlFn } from "./harness";
import { enqueueEmail } from "../../src/emailOutbox";

let client: TestClient;
let sql: SqlFn;

beforeAll(async () => {
  const db = await connectTestDb();
  client = db.client;
  sql = db.sql;
}, 60_000);
afterAll(async () => { await client?.end(); });
beforeEach(async () => { await client.query("BEGIN"); });
afterEach(async () => { await client.query("ROLLBACK"); });

const payload = { firstName: "Marie", reviewUrl: "https://x/y?code=AVP-1", nested: { a: 1 } };

describe("email_outbox payload round-trip", () => {
  // Goes through the REAL enqueueEmail(), not a hand-written INSERT. An earlier
  // version of this test inserted directly, which meant reverting the fix in
  // emailOutbox.ts left it green — it documented the behaviour without guarding
  // it. Exercising the shipped function is what makes it a regression test.
  it("enqueueEmail stores an object, not a JSON string", async () => {
    await enqueueEmail(sql as any, {
      template: "review-request",
      to: "a@b.co",
      payload,
      force: true, // bypass the settings toggle; this test is about storage
    });

    const rows = await sql`
      SELECT jsonb_typeof(payload) AS kind, payload FROM email_outbox WHERE to_email = ${"a@b.co"}
    `;
    expect(rows[0].kind).toBe("object");
    expect(rows[0].payload.firstName).toBe("Marie");
    expect(rows[0].payload.nested.a).toBe(1);
  });

  // Pins WHY, so the fix is not "cleaned up" back into a stringify.
  it("the stringified form is what breaks it", async () => {
    await sql`
      INSERT INTO email_outbox (to_email, template, locale, payload)
      VALUES (${"c@d.co"}, ${"review-request"}, ${"fr"}, ${JSON.stringify(payload)})
    `;
    const rows = await sql`
      SELECT jsonb_typeof(payload) AS kind, payload FROM email_outbox WHERE to_email = ${"c@d.co"}
    `;
    expect(rows[0].kind).toBe("string");
    expect(rows[0].payload.firstName).toBeUndefined();
  });

  // The ::jsonb cast looks like it should help and does not — worth pinning,
  // because it is the obvious "fix" someone would reach for.
  it("a ::jsonb cast does not rescue the stringified form", async () => {
    await sql`
      INSERT INTO email_outbox (to_email, template, locale, payload)
      VALUES (${"e@f.co"}, ${"review-request"}, ${"fr"}, ${JSON.stringify(payload)}::jsonb)
    `;
    const rows = await sql`
      SELECT jsonb_typeof(payload) AS kind FROM email_outbox WHERE to_email = ${"e@f.co"}
    `;
    expect(rows[0].kind).toBe("string");
  });
});

describe("hubspot_outbox payload round-trip", () => {
  it("stores an object so payload.email is readable", async () => {
    const hs = { email: "guest@example.com", firstname: "Guest" };
    await sql`
      INSERT INTO hubspot_outbox (kind, payload, dedupe_key)
      VALUES (${"contact.upsert"}, ${hs}, ${"dedupe-1"})
    `;
    const rows = await sql`
      SELECT jsonb_typeof(payload) AS kind, payload FROM hubspot_outbox WHERE dedupe_key = ${"dedupe-1"}
    `;
    expect(rows[0].kind).toBe("object");
    // The exact read that produced "operator EQ requires a value".
    expect(rows[0].payload.email).toBe("guest@example.com");
  });
});
