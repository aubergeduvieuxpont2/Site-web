import { describe, it, expect, vi } from "vitest";
import {
  CODE_ALPHABET,
  CODE_PREFIX,
  CODE_REGEX,
  generateCode,
  generateUniqueCode,
} from "./reservationCode";

// ── CODE_ALPHABET ─────────────────────────────────────────────────────────────

describe("CODE_ALPHABET", () => {
  it("has exactly 32 characters", () => {
    expect(CODE_ALPHABET.length).toBe(32);
  });

  it("excludes 0, O, 1, I (Crockford base32 exclusions)", () => {
    expect(CODE_ALPHABET).not.toContain("0");
    expect(CODE_ALPHABET).not.toContain("O");
    expect(CODE_ALPHABET).not.toContain("1");
    expect(CODE_ALPHABET).not.toContain("I");
  });

  it("contains only uppercase ASCII letters and digits", () => {
    expect(/^[A-Z2-9]+$/.test(CODE_ALPHABET)).toBe(true);
  });

  it("has no duplicate characters", () => {
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
  });
});

// ── CODE_PREFIX ───────────────────────────────────────────────────────────────

describe("CODE_PREFIX", () => {
  it("is AVP-", () => {
    expect(CODE_PREFIX).toBe("AVP-");
  });
});

// ── CODE_REGEX ────────────────────────────────────────────────────────────────

describe("CODE_REGEX", () => {
  it("matches a valid code with uppercase alphabet chars", () => {
    expect(CODE_REGEX.test("AVP-ABCDEF")).toBe(true);
  });

  it("matches a valid code with digits from the alphabet", () => {
    expect(CODE_REGEX.test("AVP-234567")).toBe(true);
  });

  it("matches a mixed valid code", () => {
    expect(CODE_REGEX.test("AVP-A2B3C4")).toBe(true);
  });

  it("rejects a code without the AVP- prefix", () => {
    expect(CODE_REGEX.test("ABCDEFGHIJ")).toBe(false);
  });

  it("rejects a code with forbidden char O (letter oh)", () => {
    expect(CODE_REGEX.test("AVP-ABODEF")).toBe(false);
  });

  it("rejects a code with forbidden char 0 (zero)", () => {
    expect(CODE_REGEX.test("AVP-AB0DEF")).toBe(false);
  });

  it("rejects a code with forbidden char I (letter eye)", () => {
    expect(CODE_REGEX.test("AVP-ABIDEF")).toBe(false);
  });

  it("rejects a code with forbidden char 1 (one)", () => {
    expect(CODE_REGEX.test("AVP-AB1DEF")).toBe(false);
  });

  it("rejects a code with only 5 suffix chars (too short)", () => {
    expect(CODE_REGEX.test("AVP-ABCDE")).toBe(false);
  });

  it("rejects a code with 7 suffix chars (too long)", () => {
    expect(CODE_REGEX.test("AVP-ABCDEFG")).toBe(false);
  });

  it("rejects lowercase suffix", () => {
    expect(CODE_REGEX.test("AVP-abcdef")).toBe(false);
  });

  it("rejects lowercase prefix", () => {
    expect(CODE_REGEX.test("avp-ABCDEF")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(CODE_REGEX.test("")).toBe(false);
  });

  it("rejects code with a space", () => {
    expect(CODE_REGEX.test("AVP-ABC EF")).toBe(false);
  });
});

// ── generateCode ──────────────────────────────────────────────────────────────

describe("generateCode", () => {
  it("returns a string matching CODE_REGEX", () => {
    expect(CODE_REGEX.test(generateCode())).toBe(true);
  });

  it("starts with AVP-", () => {
    expect(generateCode().startsWith("AVP-")).toBe(true);
  });

  it("has total length of 10 (4 prefix + 6 suffix)", () => {
    expect(generateCode().length).toBe(10);
  });

  it("uses only alphabet chars in the suffix", () => {
    const suffix = generateCode().slice(4);
    for (const char of suffix) {
      expect(CODE_ALPHABET).toContain(char);
    }
  });

  it("never produces a char from the forbidden set", () => {
    const forbidden = new Set(["0", "O", "1", "I"]);
    for (let i = 0; i < 50; i++) {
      const suffix = generateCode().slice(4);
      for (const char of suffix) {
        expect(forbidden.has(char)).toBe(false);
      }
    }
  });

  it("produces statistically distinct values across 100 calls", () => {
    const codes = new Set(Array.from({ length: 100 }, generateCode));
    // 32^6 ≈ 1.07 billion — collision in 100 draws is astronomically unlikely
    expect(codes.size).toBeGreaterThan(95);
  });
});

// ── generateUniqueCode ────────────────────────────────────────────────────────

describe("generateUniqueCode", () => {
  it("returns the first code when the DB has no existing code", async () => {
    const sql = vi.fn().mockResolvedValue([]); // no collision
    const code = await generateUniqueCode(sql as any);
    expect(CODE_REGEX.test(code)).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once when the first code collides", async () => {
    let call = 0;
    const sql = vi.fn().mockImplementation(() => {
      call++;
      return Promise.resolve(call === 1 ? [{ id: 42 }] : []);
    });
    const code = await generateUniqueCode(sql as any);
    expect(CODE_REGEX.test(code)).toBe(true);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("retries across 9 collisions before succeeding on attempt 10", async () => {
    let call = 0;
    const sql = vi.fn().mockImplementation(() => {
      call++;
      return Promise.resolve(call < 10 ? [{ id: call }] : []);
    });
    const code = await generateUniqueCode(sql as any);
    expect(CODE_REGEX.test(code)).toBe(true);
    expect(sql).toHaveBeenCalledTimes(10);
  });

  it("throws after 10 consecutive collisions (INV-code-unique guard)", async () => {
    const sql = vi.fn().mockResolvedValue([{ id: 1 }]); // always collides
    await expect(generateUniqueCode(sql as any)).rejects.toThrow(
      "generateUniqueCode: failed after 10 attempts"
    );
    expect(sql).toHaveBeenCalledTimes(10);
  });

  it("returns a code matching CODE_REGEX on each successful attempt", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    for (let i = 0; i < 20; i++) {
      const code = await generateUniqueCode(sql as any);
      expect(CODE_REGEX.test(code)).toBe(true);
    }
  });

  it("queries reservations table with the generated code", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    const code = await generateUniqueCode(sql as any);
    // The SQL should have been called once and received the generated code as a value
    expect(sql).toHaveBeenCalledTimes(1);
    const callArgs = sql.mock.calls[0];
    // Second argument onward are the interpolated values; the first is the code
    expect(callArgs[1]).toBe(code);
  });
});
