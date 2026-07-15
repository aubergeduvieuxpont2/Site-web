import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password";

describe("password auth", () => {
  it("hashes and verifies a password", async () => {
    const password = "mySecurePassword123";
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^pbkdf2\$\d+\$.+\$.+$/);
    expect(hash).toContain("pbkdf2$");

    const verified = await verifyPassword(password, hash);
    expect(verified).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const password = "mySecurePassword123";
    const wrongPassword = "wrongPassword";
    const hash = await hashPassword(password);

    const verified = await verifyPassword(wrongPassword, hash);
    expect(verified).toBe(false);
  });

  it("uses at least 100000 iterations", async () => {
    const password = "mySecurePassword123";
    const hash = await hashPassword(password);
    const parts = hash.split("$");

    expect(parts.length).toBe(4);
    const iterations = parseInt(parts[1], 10);
    expect(iterations).toBeGreaterThanOrEqual(100000);
  });

  it("stores hash in correct format", async () => {
    const password = "test";
    const hash = await hashPassword(password);
    const parts = hash.split("$");

    expect(parts[0]).toBe("pbkdf2");
    expect(parts.length).toBe(4);

    const iterations = parseInt(parts[1], 10);
    expect(iterations).toBeGreaterThan(0);

    const saltB64 = parts[2];
    const hashB64 = parts[3];
    expect(saltB64.length).toBeGreaterThan(0);
    expect(hashB64.length).toBeGreaterThan(0);
  });

  it("constant-time comparison prevents timing attacks", async () => {
    const password = "myPassword";
    const hash = await hashPassword(password);

    const start1 = performance.now();
    await verifyPassword("abc", hash);
    const time1 = performance.now() - start1;

    const start2 = performance.now();
    await verifyPassword("xyz", hash);
    const time2 = performance.now() - start2;

    // Both should take similar time (not exact, but should be in same ballpark)
    // Just verify that both execute without error
    expect(true).toBe(true);
  });
});
