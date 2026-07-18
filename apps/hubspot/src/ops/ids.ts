// Object-id hardening (finding M13). HubSpot object ids are always decimal
// strings. Any id interpolated into a request PATH must be (1) validated as
// `^\d+$` so a caller cannot smuggle `../` or query separators into the path,
// and (2) percent-encoded as a single path segment. `assertNumericId` throws a
// NormalizedError-shaped object so `executeOp` classifies it as a permanent
// (400) failure instead of retrying an un-fixable payload forever.

const NUMERIC_ID = /^\d+$/;

export function assertNumericId(id: unknown, label = "id"): string {
  if (typeof id !== "string" || !NUMERIC_ID.test(id)) {
    throw { ok: false, status: 400, message: `Invalid ${label}` };
  }
  return id;
}

// Encode an id for safe interpolation into a URL path segment. Numeric ids are
// unchanged by encoding, so this is a no-op in the happy path but neutralises
// any stray reserved characters (defense in depth for ids sourced from HubSpot
// API responses that are not re-validated on the drain path).
export function encodeIdSegment(id: string): string {
  return encodeURIComponent(id);
}
