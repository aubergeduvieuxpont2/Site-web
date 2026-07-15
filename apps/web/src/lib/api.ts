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
}

export interface ReservationRow {
  id: number;
  email: string;
  name: string;
  check_in: string;
  check_out: string;
  guests: number;
  message: string | null;
  created_at: string;
  updated_at: string;
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

export interface ApiError {
  error: string;
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

export async function register(
  email: string,
  password: string,
  name?: string | null,
): Promise<{ user: User } | ApiError> {
  return fetchJson<{ user: User }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: name ?? null }),
  });
}

export async function logout(): Promise<{ ok: true } | ApiError> {
  return fetchJson<{ ok: true }>("/auth/logout", { method: "POST" });
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
// Guest reservation
// ---------------------------------------------------------------------------

export async function createReservation(data: {
  name: string;
  email: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  message?: string;
}): Promise<{ reservation: ReservationRow } | ApiError> {
  return fetchJson<{ reservation: ReservationRow }>("/reservations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
