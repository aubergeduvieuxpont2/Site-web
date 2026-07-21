import { describe, it, expect } from "vitest";
import { fr } from "../messages/fr";
import { en } from "../messages/en";

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, val]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return flattenKeys(val as Record<string, unknown>, full);
    }
    return [full];
  });
}

function allLeaves(obj: Record<string, unknown>, prefix = ""): Array<{ key: string; value: unknown }> {
  return Object.entries(obj).flatMap(([k, v]) => {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      return allLeaves(v as Record<string, unknown>, full);
    }
    return [{ key: full, value: v }];
  });
}

describe("i18n key parity (INV-key-parity)", () => {
  const frKeys = flattenKeys(fr as Record<string, unknown>).sort();
  const enKeys = flattenKeys(en as Record<string, unknown>).sort();

  it("the fr and en dictionaries expose identical dot-key sets", () => {
    const missingFromEn = frKeys.filter((k) => !enKeys.includes(k));
    const missingFromFr = enKeys.filter((k) => !frKeys.includes(k));

    expect(missingFromEn, "keys present in fr but absent from en").toEqual([]);
    expect(missingFromFr, "keys present in en but absent from fr").toEqual([]);
    expect(frKeys).toEqual(enKeys);
  });

  it("the dictionaries are non-empty", () => {
    expect(frKeys.length).toBeGreaterThan(0);
  });

  it("every leaf value in the fr dictionary is a string", () => {
    for (const { key, value } of allLeaves(fr as Record<string, unknown>)) {
      expect(typeof value, `fr["${key}"] must be a string`).toBe("string");
    }
  });

  it("every leaf value in the en dictionary is a string", () => {
    for (const { key, value } of allLeaves(en as Record<string, unknown>)) {
      expect(typeof value, `en["${key}"] must be a string`).toBe("string");
    }
  });

  it("the fr dictionary has the same total key count as the en dictionary", () => {
    expect(frKeys.length).toBe(enKeys.length);
  });
});
