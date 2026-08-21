// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () =>
    (strings: TemplateStringsArray, ...values: unknown[]) =>
      neonHolder.sql(strings, ...values),
}));

import { app } from "../index";

/**
 * HubSpot is the source of truth for CRM data, so a profile edit must reach it.
 * Previously the handler saved to Postgres and stopped there — contacts were
 * synced at registration and never updated again.
 */
const UPDATED = {
  id: 3,
  email: "guest@example.com",
  name: "Marie Tremblay",
  role: "guest",
  hubspot_contact_id: "266975223769",
  first_name: "Marie",
  last_name: "Tremblay",
  phone: "4185551234",
  company: null,
  locale: "fr",
  pending_email: null,
  address_street: "1 rue Principale",
  address_city: "Saint-Raymond",
  address_province: "Quebec",
  address_postal_code: "G3L1A1",
};

function stub() {
  const enqueued: any[] = [];
  neonHolder.sql = (strings: TemplateStringsArray) => {
    const q = strings.join("?");
    if (q.includes("FROM sessions") && q.includes("JOIN users")) {
      return Promise.resolve([{ id: 3, email: UPDATED.email, name: UPDATED.name, role: "guest", hubspot_contact_id: UPDATED.hubspot_contact_id }]);
    }
    if (q.includes("UPDATE users")) return Promise.resolve([UPDATED]);
    return Promise.resolve([]);
  };
  const env: any = {
    DB_CONN: "postgres://stub",
    GATEWAY_AUTH_SECRET: "secret",
    HUBSPOT: {
      fetch: async (req: Request) => {
        enqueued.push(await req.json());
        return new Response("{}", { status: 200 });
      },
    },
  };
  return { env, enqueued };
}

const body = JSON.stringify({
  firstName: "Marie", lastName: "Tremblay", phone: "4185551234", company: null,
  addressStreet: "1 rue Principale", addressCity: "Saint-Raymond",
  addressProvince: "Quebec", addressPostalCode: "G3L1A1",
});

async function patch(env: any) {
  const ctx: any = { waitUntil: (p: Promise<unknown>) => p, passThroughOnException() {} };
  return app.fetch(
    new Request("http://x/api/profile/contact", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: "session=t" },
      body,
    }),
    env,
    ctx,
  );
}

describe("profile update syncs to HubSpot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enqueues a contact.upsert with the saved values", async () => {
    const { env, enqueued } = stub();
    const res = await patch(env);
    expect(res.status).toBe(200);

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].kind).toBe("contact.upsert");
    const p = enqueued[0].payload;
    expect(p.email).toBe("guest@example.com");
    expect(p.firstname).toBe("Marie");
    expect(p.lastname).toBe("Tremblay");
    expect(p.phone).toBe("4185551234");
    expect(p.address).toBe("1 rue Principale");
    expect(p.city).toBe("Saint-Raymond");
    expect(p.state).toBe("Quebec");
    expect(p.zip).toBe("G3L1A1");
  });

  // HubSpot treats an empty string as "clear this property", so a blank local
  // field must not wipe CRM data an operator may have curated by hand.
  it("omits empty fields rather than sending blanks", async () => {
    const { env, enqueued } = stub();
    await patch(env);
    expect(enqueued[0].payload).not.toHaveProperty("company");
  });

  it("does not fail the save when the gateway errors", async () => {
    const { env } = stub();
    env.HUBSPOT.fetch = async () => { throw new Error("gateway down"); };
    const res = await patch(env);
    expect(res.status).toBe(200);
  });
});
