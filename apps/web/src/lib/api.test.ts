// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isError,
  getMe,
  login,
  register,
  forgotPassword,
  resetPassword,
  logout,
  changePassword,
  changeProfileEmail,
  getProfile,
  adminReservations,
  adminSetReservationStatus,
  adminOutbox,
  requeueOutbox,
  createReservation,
} from "./api";

type FetchCall = { url: string; init: RequestInit };

/**
 * Install a fake `fetch` that records the call and returns a Response-like
 * object exposing only what `fetchJson` uses (`status` + `json()`).
 */
function stubFetch(
  body: unknown,
  status = 200,
): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fake = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return {
      status,
      json: async () => body,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fake);
  return { calls };
}

function lastCall(calls: FetchCall[]): FetchCall {
  const call = calls[calls.length - 1];
  if (!call) throw new Error("fetch was not called");
  return call;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isError", () => {
  it("returns true for an { error } shape", () => {
    expect(isError({ error: "boom" })).toBe(true);
  });

  it("returns false for a success payload", () => {
    expect(isError({ user: { id: 1 } })).toBe(false);
  });

  it("returns false for null / non-objects", () => {
    expect(isError(null)).toBe(false);
    expect(isError("error")).toBe(false);
    expect(isError({ error: 42 })).toBe(false);
  });
});

describe("credential & header invariants", () => {
  it("every request sends credentials: 'include' and a JSON content-type", async () => {
    const { calls } = stubFetch({ user: { id: 1 } });
    await getMe();
    const { init } = lastCall(calls);
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("credentials cannot be overridden by a caller's init", async () => {
    // fetchJson applies credentials after spreading init, so it always wins.
    const { calls } = stubFetch({ ok: true });
    await logout();
    expect(lastCall(calls).init.credentials).toBe("include");
  });

  it("targets same-origin /api/* URLs only", async () => {
    const { calls } = stubFetch({ user: { id: 1 } });
    await getMe();
    expect(lastCall(calls).url).toBe("/api/auth/me");
  });
});

describe("auth helpers", () => {
  it("getMe issues GET /api/auth/me", async () => {
    const user = { id: 1, email: "a@b.c", name: null, role: "guest" };
    const { calls } = stubFetch({ user });
    const res = await getMe();
    const { url, init } = lastCall(calls);
    expect(url).toBe("/api/auth/me");
    expect(init.method ?? "GET").toBe("GET");
    expect(res).toEqual({ user });
  });

  it("login POSTs credentials in the body", async () => {
    const { calls } = stubFetch({ user: { id: 1 } });
    await login("jean@ex.com", "hunter2pass");
    const { url, init } = lastCall(calls);
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "jean@ex.com",
      password: "hunter2pass",
    });
  });

  it("login surfaces the identical 401 message (no enumeration leak)", async () => {
    const { calls } = stubFetch({ error: "Identifiants invalides" }, 401);
    const res = await login("nobody@ex.com", "wrongpass");
    expect(isError(res)).toBe(true);
    expect(res).toEqual({ error: "Identifiants invalides" });
    expect(lastCall(calls).url).toBe("/api/auth/login");
  });

  it("register sends null profile fields by default and maps 409 to an error", async () => {
    const { calls } = stubFetch({ error: "Un compte existe déjà" }, 409);
    const res = await register("dup@ex.com", "longenough");
    expect(JSON.parse(lastCall(calls).init.body as string)).toEqual({
      email: "dup@ex.com",
      password: "longenough",
      firstName: null,
      lastName: null,
      phone: null,
      company: null,
    });
    expect(res).toEqual({ error: "Un compte existe déjà" });
  });

  it("register forwards explicit profile fields", async () => {
    const { calls } = stubFetch({ user: { id: 2 } }, 201);
    await register("new@ex.com", "longenough", {
      firstName: "Marie",
      lastName: "Curie",
      company: "Hydro-Québec",
    });
    expect(JSON.parse(lastCall(calls).init.body as string)).toEqual({
      email: "new@ex.com",
      password: "longenough",
      firstName: "Marie",
      lastName: "Curie",
      phone: null,
      company: "Hydro-Québec",
    });
  });

  it("forgotPassword POSTs only the email to /api/auth/forgot", async () => {
    const { calls } = stubFetch({ ok: true });
    const res = await forgotPassword("who@ex.com");
    const { url, init } = lastCall(calls);
    expect(url).toBe("/api/auth/forgot");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ email: "who@ex.com" });
    expect(res).toEqual({ ok: true });
  });

  it("resetPassword POSTs the token and new password to /api/auth/reset", async () => {
    const { calls } = stubFetch({ ok: true });
    const res = await resetPassword("tok-123", "newpass34");
    const { url, init } = lastCall(calls);
    expect(url).toBe("/api/auth/reset");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({
      token: "tok-123",
      newPassword: "newpass34",
    });
    expect(res).toEqual({ ok: true });
  });

  it("resetPassword surfaces an invalid/expired token error", async () => {
    stubFetch({ error: "Lien invalide ou expiré" }, 400);
    const res = await resetPassword("bad-token", "newpass34");
    expect(isError(res)).toBe(true);
    expect(res).toEqual({ error: "Lien invalide ou expiré" });
  });

  it("logout POSTs to /api/auth/logout", async () => {
    const { calls } = stubFetch({ ok: true });
    const res = await logout();
    const { url, init } = lastCall(calls);
    expect(url).toBe("/api/auth/logout");
    expect(init.method).toBe("POST");
    expect(res).toEqual({ ok: true });
  });

  it("changePassword POSTs both passwords in the body to /api/auth/password", async () => {
    const { calls } = stubFetch({ ok: true });
    const res = await changePassword("oldpass12", "newpass34");
    const { url, init } = lastCall(calls);
    expect(url).toBe("/api/auth/password");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({
      currentPassword: "oldpass12",
      newPassword: "newpass34",
    });
    expect(res).toEqual({ ok: true });
  });

  it("changePassword surfaces a 400 wrong-current-password error", async () => {
    stubFetch({ error: "Mot de passe actuel incorrect" }, 400);
    const res = await changePassword("wrong", "newpass34");
    expect(isError(res)).toBe(true);
    expect(res).toEqual({ error: "Mot de passe actuel incorrect" });
  });

  it("changePassword surfaces a 401 when unauthenticated", async () => {
    stubFetch({ error: "Non authentifié" }, 401);
    const res = await changePassword("oldpass12", "newpass34");
    expect(isError(res)).toBe(true);
  });
});

describe("profile", () => {
  it("getProfile GETs /api/profile", async () => {
    const payload = {
      user: { id: 1, email: "a@b.c", name: "A", role: "guest" },
      reservations: [],
      hubspot: { contact: null, deals: [] },
    };
    const { calls } = stubFetch(payload);
    const res = await getProfile();
    expect(lastCall(calls).url).toBe("/api/profile");
    expect(res).toEqual(payload);
  });

  it("passes through a 401 error body", async () => {
    stubFetch({ error: "Non authentifié" }, 401);
    const res = await getProfile();
    expect(isError(res)).toBe(true);
  });

  it("changeProfileEmail POSTs newEmail + currentPassword to /api/profile/email", async () => {
    const payload = { user: { id: 1, email: "new@b.c", name: "A", role: "guest" } };
    const { calls } = stubFetch(payload);
    const res = await changeProfileEmail("new@b.c", "current-pass");
    const { url, init } = lastCall(calls);
    expect(url).toBe("/api/profile/email");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({
      newEmail: "new@b.c",
      currentPassword: "current-pass",
    });
    expect(res).toEqual(payload);
  });

  it("changeProfileEmail surfaces a 401 wrong-password error", async () => {
    stubFetch({ error: "Mot de passe actuel incorrect." }, 401);
    const res = await changeProfileEmail("new@b.c", "wrong");
    expect(isError(res)).toBe(true);
    expect(res).toEqual({ error: "Mot de passe actuel incorrect." });
  });

  it("changeProfileEmail surfaces a 409 email-already-taken conflict", async () => {
    stubFetch({ error: "Cette adresse courriel est déjà utilisée." }, 409);
    const res = await changeProfileEmail("taken@b.c", "current-pass");
    expect(isError(res)).toBe(true);
    expect(res).toEqual({ error: "Cette adresse courriel est déjà utilisée." });
  });
});

describe("admin helpers", () => {
  it("adminReservations without args hits the bare path", async () => {
    const { calls } = stubFetch({ reservations: [] });
    await adminReservations();
    expect(lastCall(calls).url).toBe("/api/admin/reservations");
  });

  it("adminReservations URL-encodes the search query", async () => {
    const { calls } = stubFetch({ reservations: [] });
    await adminReservations("a&b=c d", 25);
    const { url } = lastCall(calls);
    expect(url).toContain("/api/admin/reservations?");
    expect(url).toContain("q=a%26b%3Dc+d");
    expect(url).toContain("limit=25");
    // The fixed path prefix is intact — the query can't inject a new segment.
    expect(url.startsWith("/api/admin/reservations?")).toBe(true);
  });

  it("adminReservations ignores a blank query", async () => {
    const { calls } = stubFetch({ reservations: [] });
    await adminReservations("   ");
    expect(lastCall(calls).url).toBe("/api/admin/reservations");
  });

  it("adminOutbox appends a status filter", async () => {
    const { calls } = stubFetch({ rows: [] });
    await adminOutbox("failed");
    expect(lastCall(calls).url).toBe("/api/admin/outbox?status=failed");
  });

  it("adminOutbox without a status hits the bare path", async () => {
    const { calls } = stubFetch({ rows: [] });
    await adminOutbox();
    expect(lastCall(calls).url).toBe("/api/admin/outbox");
  });

  it("adminForbidden path returns 403 error body", async () => {
    stubFetch({ error: "Accès refusé" }, 403);
    const res = await adminReservations();
    expect(res).toEqual({ error: "Accès refusé" });
  });
});

describe("adminSetReservationStatus", () => {
  it("PATCHes the status to /api/admin/reservations/:id/status", async () => {
    const { calls } = stubFetch({
      reservation: { id: 7, status: "confirmed" },
    });
    const res = await adminSetReservationStatus(7, "confirmed");
    const { url, init } = lastCall(calls);
    expect(url).toBe("/api/admin/reservations/7/status");
    expect(init.method).toBe("PATCH");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ status: "confirmed" });
    expect(res).toEqual({ reservation: { id: 7, status: "confirmed" } });
  });

  it("accepts each valid status literal", async () => {
    const { calls } = stubFetch({ reservation: { id: 3 } });
    await adminSetReservationStatus(3, "pending");
    expect(JSON.parse(lastCall(calls).init.body as string)).toEqual({
      status: "pending",
    });
    await adminSetReservationStatus(3, "cancelled");
    expect(JSON.parse(lastCall(calls).init.body as string)).toEqual({
      status: "cancelled",
    });
  });

  it("truncates a non-integer id before use", async () => {
    const { calls } = stubFetch({ reservation: { id: 4 } });
    await adminSetReservationStatus(4.9, "confirmed");
    expect(lastCall(calls).url).toBe("/api/admin/reservations/4/status");
  });

  it("rejects a non-positive id without calling fetch", async () => {
    const { calls } = stubFetch({ reservation: {} });
    const res = await adminSetReservationStatus(0, "confirmed");
    expect(res).toEqual({ error: "Identifiant invalide" });
    expect(calls.length).toBe(0);
  });

  it("rejects NaN / Infinity ids without calling fetch", async () => {
    const { calls } = stubFetch({ reservation: {} });
    expect(await adminSetReservationStatus(Number.NaN, "confirmed")).toEqual({
      error: "Identifiant invalide",
    });
    expect(
      await adminSetReservationStatus(Number.POSITIVE_INFINITY, "confirmed"),
    ).toEqual({ error: "Identifiant invalide" });
    expect(calls.length).toBe(0);
  });

  it("rejects an invalid status literal without calling fetch", async () => {
    const { calls } = stubFetch({ reservation: {} });
    const res = await adminSetReservationStatus(
      7,
      "bogus" as unknown as "confirmed",
    );
    expect(res).toEqual({ error: "Statut invalide" });
    expect(calls.length).toBe(0);
  });

  it("maps a 404 to an error body", async () => {
    stubFetch({ error: "Introuvable" }, 404);
    const res = await adminSetReservationStatus(999, "confirmed");
    expect(res).toEqual({ error: "Introuvable" });
  });
});

describe("requeueOutbox", () => {
  it("POSTs to the requeue endpoint for a valid id", async () => {
    const { calls } = stubFetch({ row: { id: 7, status: "pending" } });
    const res = await requeueOutbox(7);
    const { url, init } = lastCall(calls);
    expect(url).toBe("/api/admin/outbox/7/requeue");
    expect(init.method).toBe("POST");
    expect(res).toEqual({ row: { id: 7, status: "pending" } });
  });

  it("truncates a non-integer id before use", async () => {
    const { calls } = stubFetch({ row: { id: 3 } });
    await requeueOutbox(3.9);
    expect(lastCall(calls).url).toBe("/api/admin/outbox/3/requeue");
  });

  it("rejects a non-positive id without calling fetch", async () => {
    const { calls } = stubFetch({ row: {} });
    const res = await requeueOutbox(0);
    expect(res).toEqual({ error: "Identifiant invalide" });
    expect(calls.length).toBe(0);
  });

  it("rejects NaN / Infinity without calling fetch", async () => {
    const { calls } = stubFetch({ row: {} });
    expect(await requeueOutbox(Number.NaN)).toEqual({ error: "Identifiant invalide" });
    expect(await requeueOutbox(Number.POSITIVE_INFINITY)).toEqual({
      error: "Identifiant invalide",
    });
    expect(calls.length).toBe(0);
  });

  it("maps a 404 to an error body", async () => {
    stubFetch({ error: "Introuvable" }, 404);
    const res = await requeueOutbox(999);
    expect(res).toEqual({ error: "Introuvable" });
  });
});

describe("createReservation", () => {
  it("POSTs the reservation payload", async () => {
    const { calls } = stubFetch({ reservation: { id: 1 } }, 201);
    const data = {
      firstName: "Jean",
      lastName: "Tremblay",
      email: "jean@ex.com",
      checkIn: "2026-08-01",
      checkOut: "2026-08-03",
      guests: 2,
      roomCount: 1,
      message: "Vue sur le pont",
    };
    const res = await createReservation(data);
    const { url, init } = lastCall(calls);
    expect(url).toBe("/api/reservations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(data);
    expect(res).toEqual({ reservation: { id: 1 } });
  });

  it("maps a 400 validation error to an error body", async () => {
    stubFetch({ error: "email invalide" }, 400);
    const res = await createReservation({
      firstName: "Jean",
      lastName: "Tremblay",
      email: "bad",
      checkIn: "2026-08-01",
      checkOut: "2026-08-03",
      guests: 1,
      roomCount: 1,
    });
    expect(isError(res)).toBe(true);
    expect(res).toEqual({ error: "email invalide" });
  });
});

describe("transport failures fold into { error }", () => {
  it("network rejection returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const res = await getMe();
    expect(isError(res)).toBe(true);
    expect(res).toEqual({ error: "Réseau indisponible" });
  });

  it("non-JSON body returns an error carrying the status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 500,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
      })) as unknown as typeof fetch,
    );
    const res = await getProfile();
    expect(res).toEqual({ error: "Erreur 500" });
  });
});
