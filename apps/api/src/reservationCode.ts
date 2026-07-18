// Crockford base32 variant: excludes digit 0, letter O, digit 1, letter I.
// Alphabet = ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (exactly 32 chars).
// INV-code-format: reservations.code matches /^AVP-[ALPHABET]{6}$/.

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_PREFIX = "AVP-";
export const CODE_REGEX = /^AVP-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

// Generate one AVP-XXXXXX code. Each of the 6 suffix characters is picked
// uniformly from CODE_ALPHABET using crypto.getRandomValues so the distribution
// is unbiased (32 divides evenly into 256).
export function generateCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += CODE_ALPHABET[bytes[i] % 32];
  }
  return CODE_PREFIX + suffix;
}

// Generate a code that does not already exist in the reservations table.
// Retries up to 10 times on collision before throwing. In practice collisions
// are astronomically rare (32^6 ≈ 1 billion codes) but the loop makes the
// contract explicit.
export async function generateUniqueCode(
  sql: (...args: any[]) => any
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const existing = (await sql`
      SELECT id FROM reservations WHERE code = ${code} LIMIT 1
    `) as { id: number }[];
    if (existing.length === 0) return code;
  }
  throw new Error("generateUniqueCode: failed after 10 attempts");
}
