import { describe, it, expect } from "vitest";
import { provisionOtaGuest } from "../src/provisioning";
import { sha256hex } from "../src/auth/session";

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
  it("creates the user, links the reservation, mints a 1-hour token, enqueues welcome", async () => {
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
    // L3(d): reset-token lifetime matches the 1h used everywhere else (was 30 days).
    expect(token!.q).toContain("1 hour");
    expect(token!.q).not.toContain("30 days");
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

  // L3(a): the stored token_hash must be the awaited SHA-256 of the emailed raw
  // token — not a pending Promise (which would stringify to "[object Promise]"
  // and never match at reset time). L3(b): the users INSERT must supply a
  // non-null password_hash for the NOT NULL column.
  it("stores the awaited sha256 of the emailed token and a non-null password_hash", async () => {
    const { sql, calls } = makeSql((q) => {
      if (q.includes("SELECT id") && q.includes("FROM users")) return [];
      if (q.includes("INSERT INTO users")) return [{ id: 88 }];
      if (q.includes("FROM settings")) return [{ value: "true" }];
      return [];
    });
    await provisionOtaGuest(sql, input);

    // Recover the raw token the guest was emailed.
    const outbox = calls.find((c) => c.q.includes("INSERT INTO email_outbox"));
    const payload = JSON.parse(
      String(outbox!.vals.find((v) => typeof v === "string" && String(v).includes("setPasswordUrl")))
    );
    const rawToken = new URL(payload.setPasswordUrl).searchParams.get("token")!;

    const tokenInsert = calls.find((c) => c.q.includes("INSERT INTO password_reset_tokens"));
    const storedHash = tokenInsert!.vals[0];
    expect(typeof storedHash).toBe("string");
    expect(storedHash).toBe(await sha256hex(rawToken)); // proves the await landed

    // users INSERT carries a real string password_hash (not null/undefined).
    const userInsert = calls.find((c) => c.q.includes("INSERT INTO users"));
    const hashArg = userInsert!.vals[1];
    expect(typeof hashArg).toBe("string");
    expect((hashArg as string).length).toBeGreaterThan(0);
    expect((hashArg as string).startsWith("pbkdf2$")).toBe(true);
  });
});
