/**
 * Shared-secret authentication for internal, service-binding-only endpoints.
 *
 * Both the API's /internal/ota-bookings route (INTERNAL_OTA_SECRET) and the
 * outbound calls to the HubSpot gateway (GATEWAY_AUTH_SECRET) rely on a short
 * secret carried in the X-Internal-Auth header. The compare is length-guarded
 * and constant-time (no early return), and an unset/empty secret always fails
 * closed so a misconfigured Worker never accepts unauthenticated callers.
 */

export const INTERNAL_AUTH_HEADER = "X-Internal-Auth";

// Length-guarded, constant-time string compare. Iterates over the longer of
// the two inputs and folds every byte difference (plus the length difference)
// into a single accumulator, so it never short-circuits on a mismatch.
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

// Fail-closed shared-secret check. An unset/empty configured secret, or a
// missing/mismatched provided value, always returns false.
export function checkSharedSecret(
  provided: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret) return false;
  if (provided == null) return false;
  return timingSafeEqual(provided, secret);
}
