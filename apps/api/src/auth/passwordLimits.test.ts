// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  PBKDF2_ITERATIONS,
  PBKDF2_MAX_SUPPORTED_ITERATIONS,
} from "./password";

/**
 * Cloudflare Workers' WebCrypto rejects PBKDF2 above 100,000 iterations:
 *
 *   NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
 *   supported (requested 600000).
 *
 * The constant was 600,000, so hashPassword() threw on every call and no
 * account could be created in production. Node's WebCrypto accepts 600,000,
 * which is why the unit suite never caught it — these tests assert the ceiling
 * explicitly rather than relying on the runtime to enforce it.
 */
describe("PBKDF2 runtime ceiling", () => {
  it("keeps the work factor at or below what Workers supports", () => {
    expect(PBKDF2_ITERATIONS).toBeLessThanOrEqual(PBKDF2_MAX_SUPPORTED_ITERATIONS);
    expect(PBKDF2_MAX_SUPPORTED_ITERATIONS).toBe(100_000);
  });

  it("embeds that count in new hashes", async () => {
    const stored = await hashPassword("a-sufficiently-long-password");
    expect(stored.split("$")[1]).toBe(String(PBKDF2_ITERATIONS));
  });

  it("round-trips a freshly created hash", async () => {
    const stored = await hashPassword("a-sufficiently-long-password");
    expect(await verifyPassword("a-sufficiently-long-password", stored)).toBe(true);
    expect(await verifyPassword("the-wrong-password-entirely", stored)).toBe(false);
  });

  // Such a hash is producible outside Workers and can arrive with imported
  // data. It must fail cleanly rather than throwing, which would turn a login
  // into a 500.
  it("refuses an unverifiable hash instead of throwing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const oversized = `pbkdf2$600000$${btoa("0123456789abcdef")}$${btoa("x".repeat(32))}`;
    await expect(verifyPassword("anything", oversized)).resolves.toBe(false);
    expect(spy).toHaveBeenCalledWith(
      "password_hash_unverifiable",
      expect.objectContaining({ iterations: 600000 }),
    );
    spy.mockRestore();
  });

  it("does not mark a current-strength hash for rehash", async () => {
    const stored = await hashPassword("a-sufficiently-long-password");
    expect(needsRehash(stored)).toBe(false);
  });
});
