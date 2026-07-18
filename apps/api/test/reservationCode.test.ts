import { describe, it, expect, vi } from "vitest";
import {
  CODE_ALPHABET,
  CODE_PREFIX,
  CODE_REGEX,
  generateCode,
  generateUniqueCode,
} from "../src/reservationCode";

// ---------------------------------------------------------------------------
// Alphabet invariants (INV-code-format depends on the alphabet being correct)
// ---------------------------------------------------------------------------

describe("CODE_ALPHABET", () => {
  it("has exactly 32 characters", () => {
    expect(CODE_ALPHABET.length).toBe(32);
  });

  it("excludes digit 0 (crockford constraint)", () => {
    expect(CODE_ALPHABET).not.toContain("0");
  });

  it("excludes letter O (crockford constraint)", () => {
    expect(CODE_ALPHABET).not.toContain("O");
  });

  it("excludes digit 1 (crockford constraint)", () => {
    expect(CODE_ALPHABET).not.toContain("1");
  });

  it("excludes letter I (crockford constraint)", () => {
    expect(CODE_ALPHABET).not.toContain("I");
  });

  it("has no duplicate characters", () => {
    const unique = new Set(CODE_ALPHABET.split(""));
    expect(unique.size).toBe(32);
  });

  it("contains only uppercase letters and digits 2-9", () => {
    for (const ch of CODE_ALPHABET) {
      expect(/^[A-Z2-9]$/.test(ch)).toBe(true);
    }
  });
});

describe("CODE_PREFIX", () => {
  it("is exactly 'AVP-'", () => {
    expect(CODE_PREFIX).toBe("AVP-");
  });
});

// ---------------------------------------------------------------------------
// CODE_REGEX — INV-code-format
// ---------------------------------------------------------------------------

describe("CODE_REGEX (INV-code-format)", () => {
  it("matches valid AVP- codes with uppercase alphabet chars", () => {
    expect(CODE_REGEX.test("AVP-ABCDEF")).toBe(true);
    expect(CODE_REGEX.test("AVP-234567")).toBe(true);
    expect(CODE_REGEX.test("AVP-ABCDE2")).toBe(true);
    expect(CODE_REGEX.test("AVP-RSTUVW")).toBe(true);
    expect(CODE_REGEX.test("AVP-XYZABC")).toBe(true);
  });

  it("rejects codes missing the AVP- prefix", () => {
    expect(CODE_REGEX.test("ABCDEFGHIJ")).toBe(false);
    expect(CODE_REGEX.test("XYZ-ABCDEF")).toBe(false);
    expect(CODE_REGEX.test("avp-ABCDEF")).toBe(false);
  });

  it("rejects codes with excluded character 0", () => {
    expect(CODE_REGEX.test("AVP-ABC0EF")).toBe(false);
  });

  it("rejects codes with excluded character O", () => {
    expect(CODE_REGEX.test("AVP-ABCOEF")).toBe(false);
  });

  it("rejects codes with excluded character 1", () => {
    expect(CODE_REGEX.test("AVP-ABC1EF")).toBe(false);
  });

  it("rejects codes with excluded character I", () => {
    expect(CODE_REGEX.test("AVP-ABCIEF")).toBe(false);
  });

  it("rejects suffix shorter than 6 characters", () => {
    expect(CODE_REGEX.test("AVP-ABCDE")).toBe(false);
    expect(CODE_REGEX.test("AVP-ABC")).toBe(false);
    expect(CODE_REGEX.test("AVP-")).toBe(false);
  });

  it("rejects suffix longer than 6 characters", () => {
    expect(CODE_REGEX.test("AVP-ABCDEFG")).toBe(false);
    expect(CODE_REGEX.test("AVP-ABCDEFGH")).toBe(false);
  });

  it("rejects lowercase letters in suffix", () => {
    expect(CODE_REGEX.test("AVP-abcdef")).toBe(false);
    expect(CODE_REGEX.test("AVP-ABCdef")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateCode — produces structurally valid codes
// ---------------------------------------------------------------------------

describe("generateCode", () => {
  it("produces a string matching CODE_REGEX (run 50 times)", () => {
    for (let i = 0; i < 50; i++) {
      expect(CODE_REGEX.test(generateCode()), `attempt ${i}`).toBe(true);
    }
  });

  it("always starts with 'AVP-'", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateCode().startsWith("AVP-")).toBe(true);
    }
  });

  it("is always exactly 10 characters long (4 prefix + 6 suffix)", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateCode().length).toBe(10);
    }
  });

  it("uses only CODE_ALPHABET characters in the 6-char suffix", () => {
    for (let i = 0; i < 50; i++) {
      const suffix = generateCode().slice(4);
      for (const ch of suffix) {
        expect(CODE_ALPHABET.includes(ch), `char '${ch}' not in alphabet`).toBe(true);
      }
    }
  });

  it("generates distinct codes (no trivial repetition)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateCode());
    }
    // 32^6 ≈ 1B distinct codes; 100 collisions would be astronomically unlikely
    expect(codes.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// generateUniqueCode — DB-collision retry loop
// ---------------------------------------------------------------------------

describe("generateUniqueCode", () => {
  it("returns a valid code on the first attempt when no collision", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    const code = await generateUniqueCode(sql);
    expect(CODE_REGEX.test(code)).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("retries once on a single collision and succeeds", async () => {
    let calls = 0;
    const sql = vi.fn().mockImplementation(() => {
      calls++;
      // First call: collision (row exists); second: no collision
      return Promise.resolve(calls === 1 ? [{ id: 1 }] : []);
    });
    const code = await generateUniqueCode(sql);
    expect(CODE_REGEX.test(code)).toBe(true);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("retries multiple times and succeeds before the 10th attempt", async () => {
    let calls = 0;
    const sql = vi.fn().mockImplementation(() => {
      calls++;
      // First 5 calls: collision; 6th: clear
      return Promise.resolve(calls <= 5 ? [{ id: calls }] : []);
    });
    const code = await generateUniqueCode(sql);
    expect(CODE_REGEX.test(code)).toBe(true);
    expect(sql).toHaveBeenCalledTimes(6);
  });

  it("throws after exactly 10 failed attempts (permanent collision)", async () => {
    const sql = vi.fn().mockResolvedValue([{ id: 999 }]);
    await expect(generateUniqueCode(sql)).rejects.toThrow(
      "generateUniqueCode: failed after 10 attempts"
    );
    expect(sql).toHaveBeenCalledTimes(10);
  });
});
