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
  hubspotContactId?: string | null;
  effectiveNightlyPrice?: number;
}

export interface ReservationRow {
  id: number;
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
  created_at: string;
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
  marketingRoomCount: number;
  // Live count of publicly-visible rooms, served by GET /api/settings. Kept
  // required client-side: loadSettings seeds it from DEFAULTS (12) so callers
  // always read a number even when the API omits it on a count failure.
  publicRoomCount: number;
  tps: number;
  tvq: number;
  accommodationTax: number;
}

// `publicRoomCount` is a live, computed public field — never part of an admin
// settings body — so it is excluded from the admin shape.
export interface AdminSettings extends Omit<PublicSettings, "publicRoomCount"> {
  assignableRoomCount: number;
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
  return fetchJson<{ user: User }>("/auth/me");
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
): Promise<{ user: User } | ApiError> {
  return fetchJson<{ user: User }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
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
}

/** Mutually-exclusive pricing body accepted by the pricing endpoint. */
export interface UserPricingBody {
  discountPercent: number | null;
  fixedNightlyPrice: number | null;
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
  lodgingTax: number;
  accommodationTax: number;
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
): Promise<{ ok: true; breakdown: InvoiceBreakdown } | ApiError> {
  const safe = safeReservationId(reservationId);
  if (safe === null) return { error: "Identifiant invalide" };
  return fetchJson<{ ok: true; breakdown: InvoiceBreakdown }>(
    `/admin/reservations/${encodeURIComponent(String(safe))}/invoice`,
    { method: "POST", body: JSON.stringify({ type, depositPercent }) },
  );
}

