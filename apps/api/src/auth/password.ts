// Cloudflare Workers' WebCrypto REJECTS PBKDF2 above 100,000 iterations:
//
//   NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
//   supported (requested 600000).
//
// This was set to 600,000 on OWASP 2023 guidance, which is correct advice for
// a runtime that allows it. On Workers it meant hashPassword() threw on every
// call, so registration and password reset could never succeed — the failure
// surfaced only as a generic 500 because the register handler discarded the
// error (fixed in #86).
//
// 100,000 is the platform ceiling, not a preference. Raising it again breaks
// account creation outright, so treat this constant as fixed by the runtime.
// If the work factor needs to increase beyond this, it requires a different
// KDF (scrypt/Argon2 via WASM), not a larger number here.
//
// New hashes use this count; older hashes embed their own count, still verify,
// and are transparently upgraded on the next successful login. See
// `needsRehash`.
export const PBKDF2_ITERATIONS = 100_000;

// Enforced by the runtime; exported so tests can pin it.
export const PBKDF2_MAX_SUPPORTED_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const iterations = PBKDF2_ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, iterations);
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(key)));
  return `pbkdf2$${iterations}$${saltB64}$${hashB64}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }

  const iterations = parseInt(parts[1], 10);
  const saltB64 = parts[2];
  const hashB64 = parts[3];

  // A hash embedding a count above the runtime ceiling cannot be verified here:
  // deriveKey would throw NotSupportedError and turn a failed login into a 500.
  // Such hashes are producible outside Workers — Node's WebCrypto accepts
  // 600,000 — so they can arrive with imported data. Refuse cleanly and say so,
  // rather than crashing: the account then needs a password reset, which is the
  // real remedy.
  if (!Number.isFinite(iterations) || iterations > PBKDF2_MAX_SUPPORTED_ITERATIONS) {
    console.error("password_hash_unverifiable", {
      reason: "iteration count exceeds the runtime maximum",
      iterations,
      max: PBKDF2_MAX_SUPPORTED_ITERATIONS,
    });
    return false;
  }

  const salt = new Uint8Array(
    atob(saltB64)
      .split("")
      .map((c) => c.charCodeAt(0))
  );
  const stored_key = new Uint8Array(
    atob(hashB64)
      .split("")
      .map((c) => c.charCodeAt(0))
  );

  const derived_key = await deriveKey(password, salt, iterations);
  const derived_bytes = new Uint8Array(derived_key);

  return constantTimeCompare(derived_bytes, stored_key);
}

// True when a stored hash is not in the current PBKDF2 format or was produced
// with fewer than the target iterations — i.e. it should be re-hashed the next
// time the plaintext is available (a successful login).
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return true;
  const iterations = parseInt(parts[1], 10);
  return !Number.isFinite(iterations) || iterations < PBKDF2_ITERATIONS;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey("raw", passwordData, "PBKDF2", false, [
    "deriveBits",
  ]);

  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt,
      iterations: iterations,
    },
    baseKey,
    256
  );
}

function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}
