import { describe, it, expect } from "vitest";
import { provisionOtaGuest } from "../src/provisioning";

type Q = { q: string; vals: unknown[] };

function makeSql(script: (q: string, vals: unknown[]) => unknown[] | undefined) {
  const calls: Q[] = [];
  const sql = async (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join("$");
    calls.push({ q, vals });
    return script(q, vals) ?? [];
  };
  return { sql: sql as any, calls };
}

const input = {
  reservationId: 10,
  guestEmail: "relay@m.expediapartnercentral.com",
  firstName: "Marie",
  lastName: "Gagnon",
  externalRef: "2511634261",
  checkIn: "2026-09-05",
  checkOut: "2026-09-06",
};

describe("provisionOtaGuest", () => {
  it("creates the user, links the reservation, mints a 30-day token, enqueues welcome", async () => {
    const { sql, calls } = makeSql((q) => {
      if (q.includes("SELECT id") && q.includes("FROM users")) return []; // no existing user
      if (q.includes("INSERT INTO users")) return [{ id: 77 }];
      if (q.includes("FROM settings")) return [{ value: "true" }]; // toggle on
      return [];
    });
    await provisionOtaGuest(sql, input);
    const inserts = calls.map((c) => c.q);
    expect(inserts.some((q) => q.includes("INSERT INTO users"))).toBe(true);
    const link = calls.find((c) => c.q.includes("UPDATE reservations") && c.q.includes("user_id"));
    expect(link).toBeDefined();
    expect(link!.vals).toContain(77);
    expect(link!.vals).toContain(10);
    const token = calls.find((c) => c.q.includes("INSERT INTO password_reset_tokens"));
    expect(token).toBeDefined();
    expect(token!.q).toContain("30 days");
    const outbox = calls.find((c) => c.q.includes("INSERT INTO email_outbox"));
    expect(outbox).toBeDefined();
    const payload = JSON.parse(String(outbox!.vals.find((v) => typeof v === "string" && String(v).includes("setPasswordUrl"))));
    expect(payload.setPasswordUrl).toMatch(/^https:\/\/www\.aubergeduvieuxpont\.ca\/reinitialisation\?token=[0-9a-f]{64}&welcome=1$/);
    expect(payload.confirmationCode).toBe("2511634261");
    expect(payload.firstName).toBe("Marie");
  });

  it("reuses an existing user and still links + mints", async () => {
    const { sql, calls } = makeSql((q) => {
      if (q.includes("SELECT id") && q.includes("FROM users")) return [{ id: 5 }];
      if (q.includes("FROM settings")) return [{ value: "true" }];
      return [];
    });
    await provisionOtaGuest(sql, input);
    expect(calls.some((c) => c.q.includes("INSERT INTO users"))).toBe(false);
    const link = calls.find((c) => c.q.includes("UPDATE reservations"));
    expect(link!.vals).toContain(5);
  });

  it("skips the email when the toggle is off but still provisions", async () => {
    const { sql, calls } = makeSql((q) => {
      if (q.includes("SELECT id") && q.includes("FROM users")) return [{ id: 5 }];
      if (q.includes("FROM settings")) return [{ value: "false" }];
      return [];
    });
    await provisionOtaGuest(sql, input);
    expect(calls.some((c) => c.q.includes("UPDATE reservations"))).toBe(true);
    expect(calls.some((c) => c.q.includes("INSERT INTO password_reset_tokens"))).toBe(true);
    expect(calls.some((c) => c.q.includes("INSERT INTO email_outbox"))).toBe(false);
  });

  it("never throws when the DB errors", async () => {
    const sql = (async () => { throw new Error("db down"); }) as any;
    await expect(provisionOtaGuest(sql, input)).resolves.toBeUndefined();
  });
});
