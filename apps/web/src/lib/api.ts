/**
 * Typed fetch helpers for the Auberge du Vieux Pont API.
 *
 * All requests are same-origin (`/api/*`) and send `credentials: 'include'` so
 * the HttpOnly `session` cookie rides along automatically. The JS layer never
 * reads the cookie itself — `credentials: 'include'` is the only credential
 * transport. Passwords are only ever placed in a request body (over HTTPS in
 * production) and are not retained after the call returns.
 *
 * Every helper returns a discriminated union `Success | { error: string }`.
 * Use {@link isError} to narrow. Non-2xx responses, non-JSON bodies, and
 * network failures all surface as `{ error: string }` so callers never have to
 * touch the raw `Response`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: "guest" | "admin";
  locale: "fr" | "en";
  hubspotContactId?: string | null;
  effectiveNightlyPrice?: number;
  effectiveWeeklyPrice?: number;
}

export interface ReservationRow {
  id: number;
  /** Human-facing code in format AVP-XXXXXX (added in migration 0037). */
  code?: string | null;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  room: string | null;
  arrive: string | null;
  depart: string | null;
  people: number;
  room_count: number | null;
  message: string | null;
  // Reservation lifecycle status. Optional/nullable so legacy rows and existing
  // fixtures created before the column existed stay valid; the UI treats a
  // null/undefined status as "pending".
  status?: "pending" | "confirmed" | "cancelled" | "held" | "released" | null;
  created_at: string;
  source?: string | null;
  external_ref?: string | null;
  user_id?: number | null;
  stripe_invoice_id?: string | null;
  invoice_status?: string | null;
  paid_at?: string | null;
}

export interface OutboxRow {
  id: number;
  kind: string;
  status: "pending" | "failed" | "done";
  attempts: number;
  dedupe_key: string | null;
  last_error: string | null;
  hubspot_id: string | null;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProfileResponse {
  user: User;
  reservations: ReservationRow[];
  hubspot: {
    contact: Record<string, unknown> | null;
    deals: Record<string, unknown>[];
  };
}

export interface AdminUserRow {
  id: number;
  email: string;
  name: string | null;
  role: "guest" | "admin";
  created_at: string;
}

export interface ApiError {
  error: string;
}

export interface PublicSettings {
  nightlyPrice: number;
  contactEmail: string;
  contactPhone: string;
  // Live count of publicly-visible rooms, served by GET /api/settings. Kept
  // required client-side: loadSettings seeds it from DEFAULTS (12) so callers
  // always read a number even when the API omits it on a count failure.
  publicRoomCount: number;
  tps: number;
  tvq: number;
  accommodationTax: number;
  weeklyPrice?: number;
  reservationsEnabled?: boolean;
}

// Matches the server-side SettingsUpdateSchema exactly. All fields are required;
// assignableRoomCount is server-derived (read-only display) and accepted but
// ignored by the server on updates.
export interface AdminSettings {
  nightlyPrice: number;
  weeklyPrice: number;
  contactEmail: string;
  contactPhone: string;
  tps: number;
  tvq: number;
  accommodationTax: number;
  assignableRoomCount: number;
  reservationsEnabled: boolean;
  emailConfirmationEnabled: boolean;
  emailPasswordResetEnabled: boolean;
  emailRoomAssignmentEnabled: boolean;
  emailWelcomeEnabled: boolean;
  emailReviewRequestEnabled: boolean;
}

/**
 * A full room record as returned by the rooms API. `image_key` is nullable
 * because a room may not yet have an R2 asset assigned. `slug` is the stable
 * identifier; it is derived server-side from the name on create.
 */
export interface Room {
  slug: string;
  name: string;
  capacity: number;
  image_key: string | null;
  is_public: boolean;
  passkey_enabled: boolean;
  passkey: string | null;
}

/**
 * The admin-editable shape of a room (create + update share it). `imageKey`
 * is camelCase on the wire and constrained server-side to the fixed R2 key
 * allow-list; the slug is never part of the body (derived on create, taken
 * from the path on update).
 */
export interface RoomInput {
  name: string;
  capacity: number;
  imageKey: string;
  isPublic: boolean;
  passkeyEnabled: boolean;
  passkey?: string;
}

/**
 * A room currently assigned to a reservation. Keyed by the stable `room_slug`
 * (the assignment join table stores the slug, not a numeric room id).
 */
export interface RoomAssignment {
  room_slug: string;
}

/**
 * A room free for a reservation's date range. `slug` is the stable key used in
 * assign/unassign calls; `name` is the display label.
 */
export interface FreeRoom {
  slug: string;
  name: string;
}

/**
 * A single blackout row as returned by the availability admin API. `date` is the
 * stable `YYYY-MM-DD` key; `rooms_blocked` is how many rooms are withheld that
 * night (equal to the assignable count for a full closure); `note` is an optional
 * operator memo.
 */
export interface BlackoutRow {
  date: string;
  rooms_blocked: number;
  note: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

const API_BASE = "/api";

/**
 * Perform a same-origin JSON request and parse the body.
 *
 * `credentials` and the merged headers are applied *after* `...init` so a
 * caller can never accidentally drop `credentials: 'include'` or the JSON
 * content-type. Any failure to reach the server or parse the body is folded
 * into the `{ error }` branch of the return union.
 */
async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | ApiError> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    return { error: "Réseau indisponible" };
  }

  try {
    return (await res.json()) as T;
  } catch {
    return { error: `Erreur ${res.status}` };
  }
}

/**
 * Type guard distinguishing an error response from a success payload.
 */
export function isError(response: unknown): response is ApiError {
  return (
    typeof response === "object" &&
    response !== null &&
    "error" in response &&
    typeof (response as { error: unknown }).error === "string"
  );
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function getMe(): Promise<{ user: User } | ApiError> {
  // Anonymous sessions get 200 { user: null } (a 401 here would log a console
  // error on every logged-out page view); normalize to ApiError for callers.
  const result = await fetchJson<{ user: User | null }>("/auth/me");
  if (!isError(result) && result.user === null) {
    return { error: "Unauthorized" };
  }
  return result as { user: User } | ApiError;
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: User } | ApiError> {
  return fetchJson<{ user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/**
 * Optional profile fields collected at registration. Each is trimmed by the
 * caller and passed as `null` when blank; the server derives the persisted
 * `name` from `firstName`/`lastName`.
 */
export interface RegisterProfile {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  company?: string | null;
}

export async function register(
  email: string,
  password: string,
  profile?: RegisterProfile,
  locale?: "fr" | "en",
): Promise<{ user: User } | ApiError> {
  return fetchJson<{ user: User }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      ...(locale !== undefined ? { locale } : {}),
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
      phone: profile?.phone ?? null,
      company: profile?.company ?? null,
    }),
  });
}

/**
 * Request a password-reset link for an email address (self-serve forgot flow).
 *
 * The API always answers 200 `{ ok: true }` regardless of whether the address
 * maps to an account — this is what prevents user enumeration, so callers must
 * show one generic message on success. Only a transport failure surfaces as
 * `{ error }`. The email is the only input and travels in the request body.
 */
export async function forgotPassword(
  email: string,
): Promise<{ ok: true } | ApiError> {
  return fetchJson<{ ok: true }>("/auth/forgot", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/**
 * Complete a password reset using a one-time token from the reset link.
 *
 * The `token` comes from the `/reinitialisation?token=…` URL and the
 * `newPassword` from the form; both travel only in the request body (over HTTPS
 * in production) and are not retained after the call returns. All decisions —
 * invalid, expired, or already-used token, and weak-password rejection — are
 * server-enforced and surface as `{ error }` in French. The client performs no
 * token validation of its own; it only reflects the API's answer.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: true } | ApiError> {
  return fetchJson<{ ok: true }>("/auth/reset", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

/**
 * Confirm an email-verification token from a `/verification?token=…` link.
 *
 * The `token` comes from the verification URL and travels only in the request
 * body. Like `resetPassword`, the client performs no validation of its own — the
 * server is the sole authority on whether a token is valid/expired/used, and on
 * whether a pending change collides with a now-taken address (surfaced as
 * `{ error }` in French). On success the API reports which flow the token
 * belonged to (`purpose`) and, when known, the confirmed `email`.
 */
export async function verifyEmail(
  token: string,
): Promise<{ ok: true; purpose: "register" | "change"; email?: string } | ApiError> {
  return fetchJson<{ ok: true; purpose: "register" | "change"; email?: string }>(
    "/auth/verify-email",
    {
      method: "POST",
      body: JSON.stringify({ token }),
    },
  );
}

export async function logout(): Promise<{ ok: true } | ApiError> {
  return fetchJson<{ ok: true }>("/auth/logout", { method: "POST" });
}

/**
 * Change the authenticated user's password.
 *
 * Both passwords travel only in the request body (over HTTPS in production) and
 * are not retained after the call returns. The session cookie authenticates the
 * request via `credentials: 'include'`; the server verifies `currentPassword`
 * before applying `newPassword`. All decisions (wrong current password, weak new
 * password) surface as `{ error }` in French from the API.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | ApiError> {
  return fetchJson<{ ok: true }>("/auth/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/**
 * Request a change to the authenticated guest's email address. Requires the
 * current password for re-authentication. The change is NOT applied immediately:
 * on success the API returns `{ ok: true, pending: true }` and sends a
 * confirmation link to the new address (plus an alert to the old one); the
 * address only switches once that link is followed. Conflicts (email already
 * taken) surface as `{ error }`.
 */
export async function changeProfileEmail(
  newEmail: string,
  currentPassword: string,
): Promise<{ ok: true; pending: true } | ApiError> {
  return fetchJson<{ ok: true; pending: true }>("/profile/email", {
    method: "POST",
    body: JSON.stringify({ newEmail, currentPassword }),
  });
}

/**
 * Persist the authenticated user's locale preference on the server. Called
 * when a logged-in visitor flips the language toggle; anonymous flips are
 * stored in cookie and localStorage only and do not call this endpoint.
 *
 * Returns `{ ok: true, locale }` on success. A 400 surfaces as `{ error }`
 * when the supplied locale is not one of the strings fr or en; a 401 surfaces
 * when no valid session is present.
 */
export async function updateLocale(
  locale: "fr" | "en",
): Promise<{ ok: true; locale: "fr" | "en" } | ApiError> {
  return fetchJson<{ ok: true; locale: "fr" | "en" }>("/auth/locale", {
    method: "POST",
    body: JSON.stringify({ locale }),
  });
}

// ---------------------------------------------------------------------------
// Profile & enrichment
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<ProfileResponse | ApiError> {
  return fetchJson<ProfileResponse>("/profile");
}

// ---------------------------------------------------------------------------
// Admin operations
// ---------------------------------------------------------------------------

export async function adminReservations(
  q?: string,
  limit?: number,
): Promise<{ reservations: ReservationRow[] } | ApiError> {
  // URLSearchParams encodes user-supplied `q`, so it cannot break out of the
  // query string or alter the fixed `/admin/reservations` path.
  const params = new URLSearchParams();
  if (q !== undefined && q.trim() !== "") params.set("q", q);
  if (limit !== undefined && Number.isFinite(limit)) {
    params.set("limit", String(Math.trunc(limit)));
  }
  const qs = params.toString();
  return fetchJson<{ reservations: ReservationRow[] }>(
    `/admin/reservations${qs ? `?${qs}` : ""}`,
  );
}

// PATCH /admin/reservations/:id/status — set the lifecycle status of a single
// reservation. `id` and `status` are validated defensively before the request
// so a malformed value never reaches the fixed, encoded path.
export async function adminSetReservationStatus(
  id: number,
  status: "pending" | "confirmed" | "cancelled",
): Promise<{ reservation: ReservationRow } | ApiError> {
  const safeId = Math.trunc(id);
  if (!Number.isInteger(safeId) || safeId <= 0) {
    return { error: "Identifiant invalide" };
  }
  if (status !== "pending" && status !== "confirmed" && status !== "cancelled") {
    return { error: "Statut invalide" };
  }
  return fetchJson<{ reservation: ReservationRow }>(
    `/admin/reservations/${encodeURIComponent(String(safeId))}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

export async function adminOutbox(
  status?: "pending" | "failed" | "done" | "all",
): Promise<{ rows: OutboxRow[] } | ApiError> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return fetchJson<{ rows: OutboxRow[] }>(`/admin/outbox${qs}`);
}

export async function requeueOutbox(
  id: number,
): Promise<{ row: OutboxRow } | ApiError> {
  // `id` is typed as number but validate defensively: only a finite integer
  // may be interpolated into the path, so a caller cannot inject path segments.
  const safeId = Math.trunc(id);
  if (!Number.isInteger(safeId) || safeId <= 0) {
    return { error: "Identifiant invalide" };
  }
  return fetchJson<{ row: OutboxRow }>(
    `/admin/outbox/${encodeURIComponent(String(safeId))}/requeue`,
    { method: "POST" },
  );
}

export interface EmailIngestRow {
  id: number;
  provider: string | null;
  status: "parsed" | "parse_failed" | "duplicate" | "ignored" | string;
  reservation_id: number | null;
  subject: string | null;
  error: string | null;
  created_at: string;
}

export async function adminEmailIngest(): Promise<
  { rows: EmailIngestRow[] } | ApiError
> {
  return fetchJson<{ rows: EmailIngestRow[] }>("/admin/email-ingest");
}

// ---------------------------------------------------------------------------
// Admin users
// ---------------------------------------------------------------------------

/**
 * List/search users by email (admin-gated). `q` is encoded via
 * `URLSearchParams`, so it cannot break out of the query string or alter the
 * fixed `/admin/users` path.
 */
export async function adminUsers(
  q?: string,
): Promise<{ users: AdminUserRow[] } | ApiError> {
  const params = new URLSearchParams();
  if (q !== undefined && q.trim() !== "") params.set("q", q);
  const qs = params.toString();
  return fetchJson<{ users: AdminUserRow[] }>(`/admin/users${qs ? `?${qs}` : ""}`);
}

/**
 * Promote/demote a user's role (admin-gated). `id` is validated defensively so
 * only a finite positive integer is interpolated into the path; `role` is
 * constrained to the two-value union before it leaves the client. The server
 * independently rejects an admin changing their own role.
 */
export async function adminSetUserRole(
  id: number,
  role: "guest" | "admin",
): Promise<{ user: AdminUserRow } | ApiError> {
  const safeId = Math.trunc(id);
  if (!Number.isInteger(safeId) || safeId <= 0) {
    return { error: "Identifiant invalide" };
  }
  if (role !== "guest" && role !== "admin") {
    return { error: "Rôle invalide" };
  }
  return fetchJson<{ user: AdminUserRow }>(
    `/admin/users/${encodeURIComponent(String(safeId))}/role`,
    { method: "POST", body: JSON.stringify({ role }) },
  );
}

/**
 * Generate a one-time password-reset link for a user (admin-gated). Returns the
 * `/reinitialisation?token=…` URL built server-side from the request origin.
 * `id` is validated defensively before interpolation into the path.
 */
export async function adminUserResetLink(
  id: number,
): Promise<{ url: string } | ApiError> {
  const safeId = Math.trunc(id);
  if (!Number.isInteger(safeId) || safeId <= 0) {
    return { error: "Identifiant invalide" };
  }
  return fetchJson<{ url: string }>(
    `/admin/users/${encodeURIComponent(String(safeId))}/reset-link`,
    { method: "POST" },
  );
}

/**
 * Full local-profile shape returned by `GET /api/admin/users/:id` (admin-gated).
 * These are the columns persisted in Postgres — HubSpot live data is delivered
 * separately in the `hubspot` field so a HubSpot outage never blocks the local
 * record.
 */
export interface AdminUserDetail {
  id: number;
  email: string;
  name: string | null;
  role: "guest" | "admin";
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  created_at: string;
  hubspot_contact_id: string | null;
  discount_percent: number | null;
  fixed_nightly_price: number | null;
  fixed_weekly_price: number | null;
}

/** Mutually-exclusive pricing body accepted by the pricing endpoint. */
export interface UserPricingBody {
  discountPercent: number | null;
  fixedNightlyPrice: number | null;
  fixedWeeklyPrice: number | null;
}

/**
 * Fetch a single user's full local profile plus any live HubSpot properties
 * (admin-gated). `hubspot` is `null` when the account has no HubSpot id or the
 * portal call failed — the server never returns a 5xx for that case. `id` is
 * validated defensively before it is interpolated into the path.
 */
export async function adminGetUser(
  id: number | string,
): Promise<
  { user: AdminUserDetail; hubspot: Record<string, unknown> | null } | ApiError
> {
  const safeId = Math.trunc(Number(id));
  if (!Number.isInteger(safeId) || safeId <= 0) {
    return { error: "Identifiant invalide" };
  }
  return fetchJson<{
    user: AdminUserDetail;
    hubspot: Record<string, unknown> | null;
  }>(`/admin/users/${encodeURIComponent(String(safeId))}`);
}

/**
 * Set a user's custom nightly pricing (admin-gated). Exactly one of the two
 * columns should be non-null; the server enforces mutual exclusivity and nulls
 * the other. `id` is validated defensively before path interpolation.
 */
export async function adminSetUserPricing(
  id: number | string,
  body: UserPricingBody,
): Promise<{ user: AdminUserDetail } | ApiError> {
  const safeId = Math.trunc(Number(id));
  if (!Number.isInteger(safeId) || safeId <= 0) {
    return { error: "Identifiant invalide" };
  }
  return fetchJson<{ user: AdminUserDetail }>(
    `/admin/users/${encodeURIComponent(String(safeId))}/pricing`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

// ---------------------------------------------------------------------------
// Guest reservation
// ---------------------------------------------------------------------------

export async function createReservation(data: {
  firstName: string;
  lastName: string;
  email: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  roomCount: number;
  message?: string;
}): Promise<{ reservation: ReservationRow } | ApiError> {
  return fetchJson<{ reservation: ReservationRow }>("/reservations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getPublicSettings(): Promise<PublicSettings | ApiError> {
  return fetchJson<PublicSettings>("/settings");
}

// ---------------------------------------------------------------------------
// Availability (public)
// ---------------------------------------------------------------------------

/** Per-night availability: how many rooms are free on that calendar night. */
export interface AvailabilityNight {
  date: string; // "YYYY-MM-DD"
  available: number;
}

/**
 * Result of `GET /api/availability`. `unavailableNights` lists the dates where
 * fewer than the requested rooms are free; `allAvailable` is the convenience
 * flag `unavailableNights.length === 0`.
 */
export interface AvailabilityResponse {
  nights: AvailabilityNight[];
  unavailableNights: string[];
  allAvailable: boolean;
}

/**
 * Public availability check for a half-open `[checkIn, checkOut)` date range.
 *
 * All three parameters travel as query params encoded via `URLSearchParams`, so
 * user-supplied dates cannot break out of the query string or alter the fixed
 * `/availability` path. `rooms` is coerced to a positive integer client-side; the
 * server independently rejects invalid dates (`depart <= arrive`) or `rooms < 1`
 * with a 400 that surfaces through the `{ error }` branch.
 */
export async function getAvailability(
  checkIn: string,
  checkOut: string,
  rooms: number,
): Promise<AvailabilityResponse | ApiError> {
  const safeRooms = Math.trunc(Number(rooms));
  const params = new URLSearchParams({
    checkIn,
    checkOut,
    rooms: String(Number.isFinite(safeRooms) && safeRooms > 0 ? safeRooms : 1),
  });
  return fetchJson<AvailabilityResponse>(`/availability?${params.toString()}`);
}

export async function adminGetSettings(): Promise<AdminSettings | ApiError> {
  return fetchJson<AdminSettings>("/admin/settings");
}

export async function adminUpdateSettings(
  data: AdminSettings,
): Promise<AdminSettings | ApiError> {
  return fetchJson<AdminSettings>("/admin/settings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/** Admin-gated: every room's full record. */
export async function adminRooms(): Promise<{ rooms: Room[] } | ApiError> {
  return fetchJson<{ rooms: Room[] }>("/admin/rooms");
}

/**
 * Admin-gated: create a room. The server derives the `slug` from `name`, so
 * the body carries only the editable fields. `imageKey` is validated against
 * the fixed R2 allow-list server-side; a duplicate slug surfaces as an error.
 */
export async function adminCreateRoom(
  input: RoomInput,
): Promise<{ room: Room } | ApiError> {
  return fetchJson<{ room: Room }>("/admin/rooms", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Admin-gated: update one room in place. `slug` is encoded into the fixed
 * `/admin/rooms/:slug` path so it cannot inject extra path segments; the body
 * carries the full editable shape.
 */
export async function adminUpdateRoom(
  slug: string,
  input: RoomInput,
): Promise<{ room: Room } | ApiError> {
  return fetchJson<{ room: Room }>(`/admin/rooms/${encodeURIComponent(slug)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/**
 * Admin-gated: delete one room. `slug` is encoded into the fixed path for the
 * same path-safety reason as {@link adminUpdateRoom}.
 */
export async function adminDeleteRoom(
  slug: string,
): Promise<{ ok: true } | ApiError> {
  return fetchJson<{ ok: true }>(`/admin/rooms/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Room assignments (admin)
// ---------------------------------------------------------------------------

/**
 * Guard a reservation id before it is interpolated into a request path. Only a
 * finite positive integer is accepted, so a caller can never inject extra path
 * segments; the guard mirrors {@link requeueOutbox} / {@link adminSetUserRole}.
 */
function safeReservationId(id: number): number | null {
  const safe = Math.trunc(id);
  return Number.isInteger(safe) && safe > 0 ? safe : null;
}

/**
 * Admin-gated: the rooms currently assigned to a reservation.
 */
export async function adminReservationAssignments(
  reservationId: number,
): Promise<{ assignments: RoomAssignment[] } | ApiError> {
  const safe = safeReservationId(reservationId);
  if (safe === null) return { error: "Identifiant invalide" };
  return fetchJson<{ assignments: RoomAssignment[] }>(
    `/admin/reservations/${encodeURIComponent(String(safe))}/assignments`,
  );
}

/**
 * Admin-gated: rooms free for a reservation's date range. The server returns a
 * 422 with a French `error` when the reservation's dates are null/invalid or
 * `depart <= arrive`; that surfaces through the `{ error }` branch.
 */
export async function adminFreeRooms(
  reservationId: number,
): Promise<{ rooms: FreeRoom[] } | ApiError> {
  const safe = safeReservationId(reservationId);
  if (safe === null) return { error: "Identifiant invalide" };
  return fetchJson<{ rooms: FreeRoom[] }>(
    `/admin/reservations/${encodeURIComponent(String(safe))}/free-rooms`,
  );
}

/**
 * Admin-gated: assign a room to a reservation. A 409 (overlap or capacity
 * reached) and a 422 (ineligible dates) both surface as `{ error }` carrying
 * the server's French message.
 */
export async function adminAssignRoom(
  reservationId: number,
  roomSlug: string,
): Promise<{ assignment: RoomAssignment } | ApiError> {
  const safe = safeReservationId(reservationId);
  if (safe === null) return { error: "Identifiant invalide" };
  return fetchJson<{ assignment: RoomAssignment }>(
    `/admin/reservations/${encodeURIComponent(String(safe))}/assignments`,
    { method: "POST", body: JSON.stringify({ roomSlug }) },
  );
}

/**
 * Admin-gated: remove a room assignment. `roomSlug` is encoded into the fixed
 * path so it cannot inject extra path segments.
 */
export async function adminUnassignRoom(
  reservationId: number,
  roomSlug: string,
): Promise<{ ok: true } | ApiError> {
  const safe = safeReservationId(reservationId);
  if (safe === null) return { error: "Identifiant invalide" };
  return fetchJson<{ ok: true }>(
    `/admin/reservations/${encodeURIComponent(String(safe))}/assignments/${encodeURIComponent(roomSlug)}`,
    { method: "DELETE" },
  );
}

/**
 * Invoice breakdown result from creating an invoice.
 */
export interface InvoiceBreakdown {
  nights: number;
  roomCount: number;
  effectiveNightly: number;
  base: number;
  accommodationTax: number;
  tps: number;
  tvq: number;
  total: number;
  amount: number;
}

/**
 * Admin-gated: create an invoice for a reservation and enqueue the HubSpot op.
 * Returns the breakdown on success (200); a 422 surfaces when the reservation
 * lacks dates or room count as `{ error }`.
 */
export async function adminCreateInvoice(
  reservationId: number,
  type: "deposit" | "full",
  depositPercent?: number,
): Promise<{ ok: true; breakdown: InvoiceBreakdown; stripeInvoiceId?: string | null; hostedInvoiceUrl?: string | null } | ApiError> {
  const safe = safeReservationId(reservationId);
  if (safe === null) return { error: "Identifiant invalide" };
  return fetchJson<{ ok: true; breakdown: InvoiceBreakdown; stripeInvoiceId?: string | null; hostedInvoiceUrl?: string | null }>(
    `/admin/reservations/${encodeURIComponent(String(safe))}/invoice`,
    { method: "POST", body: JSON.stringify({ type, depositPercent }) },
  );
}

// ---------------------------------------------------------------------------
// Availability blackouts (admin)
// ---------------------------------------------------------------------------

/**
 * Guard a blackout date before it is interpolated into a request path. Only a
 * strict `YYYY-MM-DD` string is accepted, so a caller can never inject extra
 * path segments; the guard mirrors {@link safeReservationId}. Format only —
 * calendar validity is enforced server-side.
 */
function safeBlackoutDate(date: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/**
 * Admin-gated: every blackout row, ordered by date.
 */
export async function adminBlackouts(): Promise<
  { blackouts: BlackoutRow[] } | ApiError
> {
  return fetchJson<{ blackouts: BlackoutRow[] }>("/admin/blackouts");
}

/**
 * Admin-gated: create or update the blackout for a single date (upsert on the
 * `date` primary key). `date` is validated to `YYYY-MM-DD` and encoded into the
 * fixed path so it cannot inject extra path segments; `roomsBlocked` must be a
 * finite integer ≥ 0 (the server enforces the same). A 422 (bad dates) surfaces
 * through the `{ error }` branch.
 */
export async function adminUpsertBlackout(
  date: string,
  body: { roomsBlocked: number; note?: string | null },
): Promise<{ blackout: BlackoutRow } | ApiError> {
  const safeDate = safeBlackoutDate(date);
  if (safeDate === null) return { error: "Date invalide" };
  const rooms = Math.trunc(Number(body.roomsBlocked));
  if (!Number.isInteger(rooms) || rooms < 0) {
    return { error: "Nombre de chambres invalide" };
  }
  return fetchJson<{ blackout: BlackoutRow }>(
    `/admin/blackouts/${encodeURIComponent(safeDate)}`,
    {
      method: "PUT",
      body: JSON.stringify({ roomsBlocked: rooms, note: body.note ?? null }),
    },
  );
}

/**
 * Admin-gated: delete the blackout for a single date. `date` is validated and
 * encoded into the fixed path for the same path-safety reason as
 * {@link adminUpsertBlackout}. A 404 (no such blackout) surfaces through the
 * `{ error }` branch.
 */
export async function adminDeleteBlackout(
  date: string,
): Promise<{ ok: true } | ApiError> {
  const safeDate = safeBlackoutDate(date);
  if (safeDate === null) return { error: "Date invalide" };
  return fetchJson<{ ok: true }>(
    `/admin/blackouts/${encodeURIComponent(safeDate)}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Emails (admin-gated preview)
// ---------------------------------------------------------------------------

/**
 * Summary of a transactional email template, as listed by
 * `GET /api/admin/emails/templates`. `name`/`subject` carry both locales so the
 * picker can label options in the currently-selected language without a refetch.
 */
export interface EmailTemplateSummary {
  key: string;
  name: { fr: string; en: string };
  subject: { fr: string; en: string };
}

/**
 * A rendered email preview from `GET /api/admin/emails/preview`. `html` feeds a
 * sandboxed `<iframe srcdoc>`; `text` is the plain-text fallback body.
 */
export interface EmailPreview {
  subject: string;
  html: string;
  text: string;
}

/**
 * Admin-gated: list every transactional email template with its localized name
 * and subject. 401/403 surface as `{ error }`.
 */
export async function adminEmailTemplates(): Promise<
  { templates: EmailTemplateSummary[] } | ApiError
> {
  return fetchJson<{ templates: EmailTemplateSummary[] }>("/admin/emails/templates");
}

/**
 * Admin-gated: render a single template in the given locale against its
 * committed sample data. Both `template` and `locale` are URL-encoded via
 * `URLSearchParams`, so they cannot break out of the query string.
 */
export async function adminEmailPreview(
  template: string,
  locale: "fr" | "en",
): Promise<EmailPreview | ApiError> {
  const params = new URLSearchParams({ template, locale });
  return fetchJson<EmailPreview>(`/admin/emails/preview?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// Blackout ranges (admin) — WS-B
// ---------------------------------------------------------------------------

/**
 * Admin-gated: create or update blackout rows for every day in [startDate,
 * endDate] (inclusive). Span must be ≤ 366 days; server expands to per-day
 * upserts. Returns the number of days affected.
 */
export async function adminUpsertBlackoutRange(body: {
  startDate: string;
  endDate: string;
  roomsBlocked: number;
  note?: string | null;
}): Promise<{ count: number } | ApiError> {
  return fetchJson<{ count: number }>("/admin/blackouts/range", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Admin-gated: delete all blackout rows in [start, end] (inclusive). Returns
 * the number of rows deleted.
 */
export async function adminDeleteBlackoutRange(
  start: string,
  end: string,
): Promise<{ deleted: number } | ApiError> {
  const params = new URLSearchParams({ start, end });
  return fetchJson<{ deleted: number }>(
    `/admin/blackouts/range?${params.toString()}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Dashboard (admin) — WS-C
// ---------------------------------------------------------------------------

/** One night in the 7-day availability strip. */
export interface DashboardAvailabilityNight {
  date: string;
  available: number;
}

/** Occupancy ratio for one period (null when denominator is 0). */
export interface OccupancyPeriod {
  currentMonth: number | null;
  previousMonth: number | null;
  sameMonthLastYear: number | null;
}

/** Full payload returned by GET /api/admin/dashboard. */
export interface DashboardResponse {
  guestsThisWeek: number;
  guestsLastWeek: number;
  next7Days: DashboardAvailabilityNight[];
  occupancy: OccupancyPeriod;
  returningCustomers: number;
}

/** Admin-gated: fetch all dashboard stats in a single request. */
export async function adminGetDashboard(): Promise<DashboardResponse | ApiError> {
  return fetchJson<DashboardResponse>("/admin/dashboard");
}

// ---------------------------------------------------------------------------
// Reviews (public + admin) — WS-D
// ---------------------------------------------------------------------------

/** A single approved review as returned by the public endpoint. */
export interface PublicReview {
  id: number;
  displayName: string;
  rating: number;
  body: string;
  staysCount: number;
  nightsTotal: number;
  createdAt: string;
}

/** Admin review record including moderation status. */
export interface AdminReview {
  id: number;
  reservation_id: number;
  rating: number;
  body: string;
  status: "pending" | "approved" | "rejected";
  display_name: string;
  stays_count: number;
  nights_total: number;
  created_at: string;
  moderated_at: string | null;
  reservation_code: string | null;
}

/** Public eligibility check result. */
export interface ReviewEligibility {
  eligible: boolean;
  firstName?: string;
  reason?: string;
}

/**
 * Public: check whether a reservation code is eligible for a review.
 * Rate-limited. Generic errors only — no reservation data is leaked.
 */
export async function getReviewEligibility(
  code: string,
): Promise<ReviewEligibility | ApiError> {
  const params = new URLSearchParams({ code });
  return fetchJson<ReviewEligibility>(`/reviews/eligibility?${params.toString()}`);
}

/**
 * Public: submit a review for a stay identified by its reservation code.
 * Rate-limited. A 409 means a review already exists for this stay.
 */
export async function submitReview(body: {
  code: string;
  rating: number;
  body: string;
}): Promise<{ ok: true } | ApiError> {
  return fetchJson<{ ok: true }>("/reviews", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Public: fetch approved reviews, newest first. `limit` defaults to 10,
 * capped at 100 server-side.
 */
export async function getPublicReviews(limit?: number): Promise<
  { reviews: PublicReview[]; averageRating: number | null; total: number } | ApiError
> {
  const params = new URLSearchParams();
  if (limit !== undefined && Number.isFinite(limit) && limit > 0) {
    params.set("limit", String(Math.trunc(limit)));
  }
  const qs = params.toString();
  return fetchJson<{ reviews: PublicReview[]; averageRating: number | null; total: number }>(
    `/reviews${qs ? `?${qs}` : ""}`,
  );
}

/**
 * Admin-gated: list reviews filtered by status (`pending` | `approved` |
 * `rejected` | `all`). Also returns `pendingCount` for the badge.
 */
export async function adminListReviews(
  status?: "pending" | "approved" | "rejected" | "all",
): Promise<{ reviews: AdminReview[]; pendingCount: number } | ApiError> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return fetchJson<{ reviews: AdminReview[]; pendingCount: number }>(
    `/admin/reviews${qs ? `?${qs}` : ""}`,
  );
}

/**
 * Admin-gated: approve or reject a review. Re-moderation (approved ↔
 * rejected) is allowed. Returns the updated review record.
 */
export async function adminModerateReview(
  id: number,
  status: "approved" | "rejected",
): Promise<{ review: AdminReview } | ApiError> {
  const safeId = Math.trunc(id);
  if (!Number.isInteger(safeId) || safeId <= 0) {
    return { error: "Identifiant invalide" };
  }
  return fetchJson<{ review: AdminReview }>(
    `/admin/reviews/${encodeURIComponent(String(safeId))}`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

