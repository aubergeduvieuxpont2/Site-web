/**
 * Shared-secret authentication for the HubSpot gateway's /ops/* routes.
 *
 * The gateway has no public route and is reached only over the API Worker's
 * service binding, but the binding itself is authenticated with a shared
 * secret (GATEWAY_AUTH_SECRET) carried in the X-Internal-Auth header. The
 * compare is length-guarded and constant-time (no early return); an
 * unset/empty secret fails closed so a misconfigured gateway never accepts
 * unauthenticated callers.
 */

export const INTERNAL_AUTH_HEADER = "X-Internal-Auth";

// Length-guarded, constant-time compare: iterate the longer input and fold
// every byte difference plus the length difference into one accumulator.
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

// Fail-closed shared-secret check.
export function checkSharedSecret(
  provided: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret) return false;
  if (provided == null) return false;
  return timingSafeEqual(provided, secret);
}
