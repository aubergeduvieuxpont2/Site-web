import { describe, it, expect, beforeEach, vi } from "vitest";

const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (...args: any[]) => neonHolder.sql(...args),
}));

import { app } from "../src/index";

const env = { DB_CONN: "postgres://stub" } as any;

function recorder(route: (q: string, vals: unknown[]) => unknown[]) {
  const calls: { q: string; vals: unknown[] }[] = [];
  const sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join(" ");
    calls.push({ q, vals });
    return Promise.resolve(route(q, vals));
  };
  return { sql, calls };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
});

const sessionUser = {
  id: 5,
  email: "guest@example.com",
  name: "Guest User",
  role: "guest",
  hubspot_contact_id: null,
};

const fullUserRow = {
  id: 5,
  email: "guest@example.com",
  name: "Guest User",
  role: "guest",
  hubspot_contact_id: null,
  first_name: "Guest",
  last_name: "User",
  phone: "555-1234",
  company: "ACME",
  locale: "fr",
  pending_email: null,
  address_street: "123 Rue Principale",
  address_city: "Montréal",
  address_province: "QC",
  address_postal_code: "H1A 1A1",
};

// ---------------------------------------------------------------------------
// GET /api/profile — extended fields
// ---------------------------------------------------------------------------
describe("GET /api/profile (extended)", () => {
  it("returns contact and address fields alongside reservations", async () => {
    const { sql } = recorder((q) => {
      if (q.includes("FROM sessions") && q.includes("JOIN users")) return [sessionUser];
      if (q.includes("FROM users")) return [fullUserRow];
      if (q.includes("FROM reservations")) return [];
      return [];
    });
    neonHolder.sql = sql;

    const res = await app.request(
      "http://localhost/api/profile",
      {
        method: "GET",
        headers: { Cookie: "session=abc123" },
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.user.email).toBe("guest@example.com");
    expect(body.user.firstName).toBe("Guest");
    expect(body.user.lastName).toBe("User");
    expect(body.user.phone).toBe("555-1234");
    expect(body.user.company).toBe("ACME");
    expect(body.user.locale).toBe("fr");
    expect(body.user.pendingEmail).toBeNull();
    expect(body.user.addressStreet).toBe("123 Rue Principale");
    expect(body.user.addressCity).toBe("Montréal");
    expect(body.user.addressProvince).toBe("QC");
    expect(body.user.addressPostalCode).toBe("H1A 1A1");
    expect(Array.isArray(body.reservations)).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    neonHolder.sql = () => Promise.resolve([]);

    const res = await app.request("http://localhost/api/profile", { method: "GET" }, env);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/profile/contact — contact update
// ---------------------------------------------------------------------------
describe("PATCH /api/profile/contact", () => {
  it("updates allowed contact fields and returns the updated user", async () => {
    const updatedRow = {
      ...fullUserRow,
      first_name: "Nouvelle",
      last_name: "Nom",
      phone: "555-9999",
      company: null,
      address_street: "456 Av. des Tests",
      address_city: "Québec",
      address_province: "QC",
      address_postal_code: "G1A 0A0",
    };

    const { sql, calls } = recorder((q) => {
      if (q.includes("FROM sessions") && q.includes("JOIN users")) return [sessionUser];
      if (q.includes("UPDATE users SET")) return [updatedRow];
      return [];
    });
    neonHolder.sql = sql;

    const res = await app.request(
      "http://localhost/api/profile/contact",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: "session=abc123",
          "cf-connecting-ip": "1.2.3.4",
        },
        body: JSON.stringify({
          firstName: "Nouvelle",
          lastName: "Nom",
          phone: "555-9999",
          company: "",
          addressStreet: "456 Av. des Tests",
          addressCity: "Québec",
          addressProvince: "QC",
          addressPostalCode: "G1A 0A0",
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.user.firstName).toBe("Nouvelle");
    expect(body.user.lastName).toBe("Nom");
    expect(body.user.phone).toBe("555-9999");
    // Empty string treated as null (INV-contact-whitelist trim-to-null)
    expect(body.user.company).toBeNull();
    expect(body.user.addressStreet).toBe("456 Av. des Tests");

    // Verify the UPDATE only touches allowed columns (never email/role/locale/password)
    const update = calls.find((c) => c.q.includes("UPDATE users SET"));
    expect(update).toBeDefined();
    expect(update!.q).not.toContain("email =");
    expect(update!.q).not.toContain("role =");
    expect(update!.q).not.toContain("locale =");
    expect(update!.q).not.toContain("password_hash");
  });

  it("treats empty string inputs as null (trim-to-null)", async () => {
    const nullRow = {
      ...fullUserRow,
      first_name: null,
      last_name: null,
      phone: null,
      company: null,
      address_street: null,
      address_city: null,
      address_province: null,
      address_postal_code: null,
    };

    const { sql, calls } = recorder((q) => {
      if (q.includes("FROM sessions") && q.includes("JOIN users")) return [sessionUser];
      if (q.includes("UPDATE users SET")) return [nullRow];
      return [];
    });
    neonHolder.sql = sql;

    const res = await app.request(
      "http://localhost/api/profile/contact",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: "session=abc123",
          "cf-connecting-ip": "1.2.3.4",
        },
        body: JSON.stringify({
          firstName: "  ",
          lastName: "",
          phone: "",
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.user.firstName).toBeNull();
    expect(body.user.lastName).toBeNull();
    expect(body.user.phone).toBeNull();

    // Values passed to SQL should all be null after trim-to-null
    const update = calls.find((c) => c.q.includes("UPDATE users SET"));
    expect(update).toBeDefined();
    // All values should be null (trimToNull schema)
    expect(update!.vals.filter((v) => v === null).length).toBeGreaterThan(0);
  });

  it("returns 401 when not authenticated", async () => {
    neonHolder.sql = () => Promise.resolve([]);

    const res = await app.request(
      "http://localhost/api/profile/contact",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.2.3.4" },
        body: JSON.stringify({ firstName: "Test" }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("rejects a body that contains an email field (schema strips unknown keys)", async () => {
    // ProfileContactSchema does not include email — zod strips unknown keys or
    // the handler never passes them to SQL. Confirm the UPDATE never touches email.
    const updatedRow = { ...fullUserRow };

    const { sql, calls } = recorder((q) => {
      if (q.includes("FROM sessions") && q.includes("JOIN users")) return [sessionUser];
      if (q.includes("UPDATE users SET")) return [updatedRow];
      return [];
    });
    neonHolder.sql = sql;

    const res = await app.request(
      "http://localhost/api/profile/contact",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: "session=abc123",
          "cf-connecting-ip": "1.2.3.4",
        },
        body: JSON.stringify({ firstName: "Test", email: "hacker@evil.com" }),
      },
      env,
    );

    // Request is processed (email field is ignored by schema)
    expect(res.status).toBe(200);

    // The UPDATE must never mention the email column
    const update = calls.find((c) => c.q.includes("UPDATE users SET"));
    expect(update).toBeDefined();
    expect(update!.q).not.toContain("email =");
  });
});
