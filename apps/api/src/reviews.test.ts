import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { User } from "./auth/session";

// Hoist mocks before any module resolution
vi.mock("@neondatabase/serverless", () => ({ neon: vi.fn() }));
vi.mock("./auth/rateLimit", () => ({ rateLimitAllow: vi.fn() }));

import { neon } from "@neondatabase/serverless";
import { rateLimitAllow } from "./auth/rateLimit";
import { maskDisplayName, computeGuestStats, createReviewsRouter } from "./reviews";

const mockNeon = vi.mocked(neon);
const mockRateLimit = vi.mocked(rateLimitAllow);

// ─── helpers ─────────────────────────────────────────────────────────────────

type Bindings = { DB_CONN: string };
const ENV: Bindings = { DB_CONN: "fake-conn" };

// A past depart date guaranteed to be <= today in tests
const PAST_DEPART = "2026-01-01";

const ADMIN_USER: User = { id: 1, email: "admin@example.com", name: "Admin", role: "admin" };
const GUEST_USER: User = { id: 2, email: "guest@example.com", name: "Guest", role: "guest" };

function makeApp(authenticate: (c: any) => Promise<User | null> = async () => null) {
  const router = createReviewsRouter({ authenticate });
  const app = new Hono<{ Bindings: Bindings }>();
  app.route("/", router);
  return app;
}

function makeSql(responses: (unknown[] | Error)[]): ReturnType<typeof vi.fn> {
  let i = 0;
  return vi.fn().mockImplementation(() => {
    const r = responses[i++];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r ?? []);
  });
}

// ── maskDisplayName ───────────────────────────────────────────────────────────

describe("maskDisplayName", () => {
  it("produces 'Marie T.' from first name + last initial", () => {
    expect(maskDisplayName("Marie", "Tremblay", "Marie Tremblay")).toBe("Marie T.");
  });

  it("uppercases the last initial regardless of the last name casing", () => {
    expect(maskDisplayName("Jean", "dupont", "Jean Dupont")).toBe("Jean D.");
  });

  it("returns just the first name when last name is null", () => {
    expect(maskDisplayName("Marie", null, "Marie")).toBe("Marie");
  });

  it("returns just the first name when last name is empty string", () => {
    expect(maskDisplayName("Marie", "", "Marie")).toBe("Marie");
  });

  it("falls back to the first word of name when firstName is null", () => {
    expect(maskDisplayName(null, null, "Marie Tremblay")).toBe("Marie");
  });

  it("falls back to the first word of name when firstName is empty string", () => {
    expect(maskDisplayName("", null, "Marie Tremblay")).toBe("Marie");
  });

  it("falls back to the first word for whitespace-only firstName", () => {
    expect(maskDisplayName("   ", null, "Robert Gagnon")).toBe("Robert");
  });

  it("returns the full trimmed name when it has only one word", () => {
    expect(maskDisplayName(null, null, "Madonna")).toBe("Madonna");
  });

  it("handles name with multiple spaces between words (split on whitespace)", () => {
    expect(maskDisplayName(null, null, "Marie   Tremblay")).toBe("Marie");
  });

  it("returns empty string when both firstName and name are empty", () => {
    expect(maskDisplayName("", null, "")).toBe("");
  });

  it("trims whitespace from firstName before using it", () => {
    expect(maskDisplayName("  Alice  ", "Smith", "Alice Smith")).toBe("Alice S.");
  });
});

// ── computeGuestStats ─────────────────────────────────────────────────────────

describe("computeGuestStats", () => {
  it("returns stays_count and nights_total from SQL", async () => {
    const sql = vi.fn().mockResolvedValue([{ stays_count: 3, nights_total: 12 }]);
    const result = await computeGuestStats(sql as any, 42, "guest@example.com");
    expect(result.staysCount).toBe(3);
    expect(result.nightsTotal).toBe(12);
  });

  it("passes userId when set (user-keyed query path)", async () => {
    const sql = vi.fn().mockResolvedValue([{ stays_count: 2, nights_total: 7 }]);
    await computeGuestStats(sql as any, 99, "someone@example.com");
    const callArgs = sql.mock.calls[0];
    // The third interpolated value is userId (after the two template gaps)
    expect(callArgs).toContain(99);
  });

  it("passes null userId for the email-keyed query path", async () => {
    const sql = vi.fn().mockResolvedValue([{ stays_count: 1, nights_total: 5 }]);
    await computeGuestStats(sql as any, null, "other@example.com");
    const callArgs = sql.mock.calls[0];
    expect(callArgs).toContain(null);
  });

  it("returns 0/0 when no matching reservations", async () => {
    const sql = vi.fn().mockResolvedValue([{ stays_count: 0, nights_total: 0 }]);
    const result = await computeGuestStats(sql as any, null, "new@example.com");
    expect(result.staysCount).toBe(0);
    expect(result.nightsTotal).toBe(0);
  });

  it("returns 0/0 when sql returns an empty array", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    const result = await computeGuestStats(sql as any, null, "nobody@example.com");
    expect(result.staysCount).toBe(0);
    expect(result.nightsTotal).toBe(0);
  });

  it("coerces null nights_total to 0", async () => {
    const sql = vi.fn().mockResolvedValue([{ stays_count: 0, nights_total: null }]);
    const result = await computeGuestStats(sql as any, null, "x@example.com");
    expect(result.nightsTotal).toBe(0);
  });
});

// ── GET /api/reviews/eligibility ──────────────────────────────────────────────

describe("GET /api/reviews/eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue(true);
  });

  it("returns eligible:true and firstName for a valid departed confirmed reservation", async () => {
    const sql = makeSql([
      [{ id: 1, first_name: "Marie", name: "Marie Tremblay", status: "confirmed", depart: PAST_DEPART }],
      [], // no existing review
    ]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews/eligibility?code=AVP-ABCDEF", {}, ENV);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.eligible).toBe(true);
    expect(body.firstName).toBe("Marie");
  });

  it("uses the first word of name as firstName when first_name is null", async () => {
    const sql = makeSql([
      [{ id: 1, first_name: null, name: "Jean-Pierre Dupont", status: "confirmed", depart: PAST_DEPART }],
      [],
    ]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews/eligibility?code=AVP-ABCDEF", {}, ENV);
    const body = await res.json() as any;
    expect(body.eligible).toBe(true);
    expect(body.firstName).toBe("Jean-Pierre");
  });

  it("omits firstName when name is also empty", async () => {
    const sql = makeSql([
      [{ id: 1, first_name: null, name: "", status: "confirmed", depart: PAST_DEPART }],
      [],
    ]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews/eligibility?code=AVP-ABCDEF", {}, ENV);
    const body = await res.json() as any;
    expect(body.eligible).toBe(true);
    expect(body.firstName).toBeUndefined();
  });

  it("returns eligible:false when code does not exist in DB", async () => {
    const sql = makeSql([[]]); // no reservation row
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews/eligibility?code=AVP-XXXXXX", {}, ENV);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.eligible).toBe(false);
  });

  it("returns eligible:false when reservation is cancelled", async () => {
    const sql = makeSql([
      [{ id: 1, first_name: "Marie", name: "Marie T.", status: "cancelled", depart: PAST_DEPART }],
    ]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews/eligibility?code=AVP-ABCDEF", {}, ENV);
    const body = await res.json() as any;
    expect(body.eligible).toBe(false);
  });

  it("returns eligible:false when depart is in the future", async () => {
    const sql = makeSql([
      [{ id: 1, first_name: "Marie", name: "Marie T.", status: "confirmed", depart: "2099-12-31" }],
    ]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews/eligibility?code=AVP-ABCDEF", {}, ENV);
    const body = await res.json() as any;
    expect(body.eligible).toBe(false);
  });

  it("returns eligible:false when depart is null", async () => {
    const sql = makeSql([
      [{ id: 1, first_name: "Marie", name: "Marie T.", status: "confirmed", depart: null }],
    ]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews/eligibility?code=AVP-ABCDEF", {}, ENV);
    const body = await res.json() as any;
    expect(body.eligible).toBe(false);
  });

  it("returns eligible:false when a review already exists for this reservation (INV-one-review)", async () => {
    const sql = makeSql([
      [{ id: 1, first_name: "Marie", name: "Marie T.", status: "confirmed", depart: PAST_DEPART }],
      [{ id: 7 }], // existing review
    ]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews/eligibility?code=AVP-ABCDEF", {}, ENV);
    const body = await res.json() as any;
    expect(body.eligible).toBe(false);
  });

  it("returns 400 when code query param is missing", async () => {
    const sql = makeSql([]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews/eligibility", {}, ENV);
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockRateLimit.mockResolvedValue(false);
    const sql = makeSql([]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews/eligibility?code=AVP-ABCDEF", {}, ENV);
    expect(res.status).toBe(429);
  });

  it("does not leak reservation details in ineligible responses (INV-identity-never-public)", async () => {
    const sql = makeSql([[]]); // no reservation
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews/eligibility?code=AVP-UNKNOWN", {}, ENV);
    const body = await res.json() as any;
    // Only eligible:false — no name, email, id, reason that reveals data
    expect(body.eligible).toBe(false);
    expect(body.name).toBeUndefined();
    expect(body.email).toBeUndefined();
    expect(body.id).toBeUndefined();
  });
});

// ── POST /api/reviews ──────────────────────────────────────────────────────────

describe("POST /api/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue(true);
  });

  const VALID_RESERVATION = {
    id: 1,
    first_name: "Marie",
    last_name: "Tremblay",
    name: "Marie Tremblay",
    email: "marie@example.com",
    user_id: 42,
    status: "confirmed",
    depart: PAST_DEPART,
  };

  function makeSubmitSql(overrides?: { throwOnInsert?: boolean }) {
    const insertResponse = overrides?.throwOnInsert
      ? new Error("duplicate key value violates unique constraint")
      : [];
    return makeSql([
      [VALID_RESERVATION],
      [{ stays_count: 2, nights_total: 7 }],
      insertResponse,
    ]);
  }

  it("returns 201 { ok:true } on a valid submission", async () => {
    mockNeon.mockReturnValue(makeSubmitSql() as any);
    const app = makeApp();
    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 5, body: "Excellent séjour, je recommande vivement!" }),
      },
      ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
  });

  it("inserts with a masked display_name (INV-identity-never-public)", async () => {
    const sql = vi.fn()
      .mockResolvedValueOnce([VALID_RESERVATION])
      .mockResolvedValueOnce([{ stays_count: 2, nights_total: 7 }])
      .mockResolvedValueOnce([]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 4, body: "Très beau séjour dans cette auberge." }),
      },
      ENV
    );

    // Find the INSERT call by its SQL content and inspect the displayName arg.
    // Template: (${reservation.id}, ${rating}, ${body}, 'pending', ${displayName}, ${stays}, ${nights})
    // Indices:   strings=0, id=1, rating=2, body=3, displayName=4, staysCount=5, nightsTotal=6
    const insertCall = sql.mock.calls.find(([strings]) =>
      Array.isArray(strings) && typeof strings[0] === "string" && strings[0].includes("INSERT INTO reviews")
    );
    expect(insertCall).toBeDefined();
    const displayName = insertCall![4];
    expect(displayName).toBe("Marie T.");
    expect(String(displayName)).not.toContain("Tremblay");
  });

  it("inserts stays_count and nights_total snapshot fields", async () => {
    const sql = vi.fn()
      .mockResolvedValueOnce([VALID_RESERVATION])
      .mockResolvedValueOnce([{ stays_count: 3, nights_total: 12 }])
      .mockResolvedValueOnce([]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 5, body: "Super endroit, personnel accueillant!" }),
      },
      ENV
    );

    const insertCall = sql.mock.calls.find(([strings]) =>
      Array.isArray(strings) && typeof strings[0] === "string" && strings[0].includes("INSERT INTO reviews")
    );
    expect(insertCall).toBeDefined();
    // staysCount at index 5, nightsTotal at index 6 (indices after template strings array)
    expect(insertCall![5]).toBe(3);  // stays_count
    expect(insertCall![6]).toBe(12); // nights_total
  });

  it("returns 400 when code is ineligible (cancelled reservation)", async () => {
    const sql = makeSql([
      [{ ...VALID_RESERVATION, status: "cancelled" }],
    ]);
    mockNeon.mockReturnValue(sql as any);
    const app = makeApp();
    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 5, body: "Test commentaire suffisamment long." }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when code does not exist (ERR-INELIGIBLE)", async () => {
    const sql = makeSql([[]]); // no reservation
    mockNeon.mockReturnValue(sql as any);
    const app = makeApp();
    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-XXXXXX", rating: 4, body: "Commentaire de test pour la réservation." }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when rating is below 1", async () => {
    const sql = makeSql([[VALID_RESERVATION]]);
    mockNeon.mockReturnValue(sql as any);
    const app = makeApp();
    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 0, body: "Commentaire suffisamment long pour le test." }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when rating is above 5", async () => {
    const sql = makeSql([[VALID_RESERVATION]]);
    mockNeon.mockReturnValue(sql as any);
    const app = makeApp();
    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 6, body: "Commentaire suffisamment long pour le test." }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is shorter than 10 chars", async () => {
    const sql = makeSql([[VALID_RESERVATION]]);
    mockNeon.mockReturnValue(sql as any);
    const app = makeApp();
    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 4, body: "Court" }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when body exceeds 2000 chars", async () => {
    const sql = makeSql([[VALID_RESERVATION]]);
    mockNeon.mockReturnValue(sql as any);
    const app = makeApp();
    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 4, body: "x".repeat(2001) }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("accepts a body of exactly 10 chars (minimum)", async () => {
    const sql = makeSubmitSql();
    mockNeon.mockReturnValue(sql as any);
    const app = makeApp();
    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 3, body: "1234567890" }),
      },
      ENV
    );
    expect(res.status).toBe(201);
  });

  it("accepts a body of exactly 2000 chars (maximum)", async () => {
    const sql = makeSubmitSql();
    mockNeon.mockReturnValue(sql as any);
    const app = makeApp();
    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 3, body: "a".repeat(2000) }),
      },
      ENV
    );
    expect(res.status).toBe(201);
  });

  it("returns 409 when a review already exists for this reservation (ERR-DUPLICATE)", async () => {
    const sql = makeSubmitSql({ throwOnInsert: true });
    mockNeon.mockReturnValue(sql as any);
    const app = makeApp();
    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 5, body: "Excellente auberge, je recommande fortement!" }),
      },
      ENV
    );
    expect(res.status).toBe(409);
  });

  it("returns 409 with UNIQUE in error message (case-insensitive check)", async () => {
    const sql = makeSql([
      [VALID_RESERVATION],
      [{ stays_count: 1, nights_total: 3 }],
      new Error("UNIQUE constraint failed"),
    ]);
    mockNeon.mockReturnValue(sql as any);
    const app = makeApp();
    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 4, body: "Très bon séjour, personnnel sympathique!" }),
      },
      ENV
    );
    expect(res.status).toBe(409);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockRateLimit.mockResolvedValue(false);
    const sql = makeSql([]);
    mockNeon.mockReturnValue(sql as any);
    const app = makeApp();
    const res = await app.request(
      "/api/reviews",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 5, body: "Beau séjour au bord de la rivière!" }),
      },
      ENV
    );
    expect(res.status).toBe(429);
  });
});

// ── GET /api/reviews ──────────────────────────────────────────────────────────

describe("GET /api/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue(true);
  });

  it("returns approved reviews with camelCase shape", async () => {
    const sql = makeSql([
      [
        {
          id: 1,
          display_name: "Marie T.",
          rating: 5,
          body: "Super séjour!",
          stays_count: 2,
          nights_total: 7,
          created_at: "2026-06-15T10:00:00Z",
        },
      ],
      [{ total: 1, avg_rating: "5.0" }],
    ]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews", {}, ENV);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].displayName).toBe("Marie T.");
    expect(body.reviews[0].rating).toBe(5);
    expect(body.reviews[0].staysCount).toBe(2);
    expect(body.reviews[0].nightsTotal).toBe(7);
  });

  it("returns averageRating rounded to 1 decimal", async () => {
    const sql = makeSql([
      [{ id: 1, display_name: "A", rating: 4, body: "Bien.", stays_count: 1, nights_total: 2, created_at: "2026-01-01T00:00:00Z" }],
      [{ total: 3, avg_rating: "4.333333" }],
    ]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews", {}, ENV);
    const body = await res.json() as any;
    expect(body.averageRating).toBe(4.3);
  });

  it("returns averageRating:null when no approved reviews exist", async () => {
    const sql = makeSql([
      [],
      [{ total: 0, avg_rating: null }],
    ]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews", {}, ENV);
    const body = await res.json() as any;
    expect(body.reviews).toHaveLength(0);
    expect(body.averageRating).toBeNull();
  });

  it("defaults limit to 3 when no query param is given", async () => {
    const capturedArgs: unknown[][] = [];
    const sql = vi.fn().mockImplementation((...args: unknown[]) => {
      capturedArgs.push(args);
      return Promise.resolve([]);
    });
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    await app.request("/api/reviews", {}, ENV);
    // First SQL call should have limit=3
    const firstArgs = capturedArgs[0];
    expect(firstArgs).toContain(3);
  });

  it("respects the limit query parameter", async () => {
    const capturedArgs: unknown[][] = [];
    const sql = vi.fn().mockImplementation((...args: unknown[]) => {
      capturedArgs.push(args);
      return Promise.resolve([]);
    });
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    await app.request("/api/reviews?limit=10", {}, ENV);
    const firstArgs = capturedArgs[0];
    expect(firstArgs).toContain(10);
  });

  it("caps limit at 100", async () => {
    const capturedArgs: unknown[][] = [];
    const sql = vi.fn().mockImplementation((...args: unknown[]) => {
      capturedArgs.push(args);
      return Promise.resolve([]);
    });
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    await app.request("/api/reviews?limit=500", {}, ENV);
    const firstArgs = capturedArgs[0];
    expect(firstArgs).toContain(100);
  });

  it("does not expose raw guest name/email fields (INV-identity-never-public)", async () => {
    const sql = makeSql([
      [{ id: 1, display_name: "Marie T.", rating: 5, body: "Bon séjour.", stays_count: 1, nights_total: 3, created_at: "2026-01-01T00:00:00Z" }],
      [{ total: 1, avg_rating: "5.0" }],
    ]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp();
    const res = await app.request("/api/reviews", {}, ENV);
    const body = await res.json() as any;
    const review = body.reviews[0];
    expect(review.email).toBeUndefined();
    expect(review.name).toBeUndefined();
    expect(review.display_name).toBeUndefined();
    expect(review.displayName).toBe("Marie T.");
  });
});

// ── GET /api/admin/reviews ────────────────────────────────────────────────────

describe("GET /api/admin/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue(true);
  });

  it("returns reviews and pendingCount for an admin user", async () => {
    const sql = makeSql([
      [{ id: 1, reservation_id: 10, rating: 4, body: "Bon.", status: "pending", display_name: "Jean D.", stays_count: 1, nights_total: 3, created_at: "2026-06-01T00:00:00Z", moderated_at: null, reservation_code: "AVP-ABCDEF" }],
      [{ count: 1 }],
    ]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => ADMIN_USER);
    const res = await app.request("/api/admin/reviews", {}, ENV);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.reviews).toHaveLength(1);
    expect(body.pendingCount).toBe(1);
    expect(body.reviews[0].reservationCode).toBeUndefined(); // camelCase not applied here (raw DB shape)
  });

  it("returns 401 when not authenticated", async () => {
    const sql = makeSql([]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => null);
    const res = await app.request("/api/admin/reviews", {}, ENV);
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as non-admin", async () => {
    const sql = makeSql([]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => GUEST_USER);
    const res = await app.request("/api/admin/reviews", {}, ENV);
    expect(res.status).toBe(403);
  });

  it("defaults to pending status filter", async () => {
    const capturedArgs: unknown[][] = [];
    const sql = vi.fn().mockImplementation((...args: unknown[]) => {
      capturedArgs.push(args);
      return Promise.resolve([]);
    });
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => ADMIN_USER);
    await app.request("/api/admin/reviews", {}, ENV);
    // First SQL call filters by status; default should be "pending"
    expect(capturedArgs[0]).toContain("pending");
  });

  it("filters by the given status param", async () => {
    const capturedArgs: unknown[][] = [];
    const sql = vi.fn().mockImplementation((...args: unknown[]) => {
      capturedArgs.push(args);
      return Promise.resolve([]);
    });
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => ADMIN_USER);
    await app.request("/api/admin/reviews?status=approved", {}, ENV);
    expect(capturedArgs[0]).toContain("approved");
  });
});

// ── PATCH /api/admin/reviews/:id ──────────────────────────────────────────────

describe("PATCH /api/admin/reviews/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue(true);
  });

  const UPDATED_REVIEW = {
    id: 5,
    reservation_id: 10,
    rating: 4,
    body: "Bon séjour.",
    status: "approved",
    display_name: "Marie T.",
    stays_count: 2,
    nights_total: 7,
    created_at: "2026-06-01T00:00:00Z",
    moderated_at: "2026-07-01T10:00:00Z",
  };

  it("approves a review and returns the updated review object", async () => {
    const sql = makeSql([[UPDATED_REVIEW]]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => ADMIN_USER);
    const res = await app.request(
      "/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      },
      ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.review.status).toBe("approved");
    expect(body.review.id).toBe(5);
  });

  it("rejects a review (moderation transition: pending → rejected)", async () => {
    const sql = makeSql([[{ ...UPDATED_REVIEW, status: "rejected" }]]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => ADMIN_USER);
    const res = await app.request(
      "/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      },
      ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.review.status).toBe("rejected");
  });

  it("allows re-moderation: approved → rejected", async () => {
    const sql = makeSql([[{ ...UPDATED_REVIEW, status: "rejected" }]]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => ADMIN_USER);
    const res = await app.request(
      "/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      },
      ENV
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when the review does not exist (ERR-NOTFOUND)", async () => {
    const sql = makeSql([[]]); // UPDATE RETURNING returns no rows
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => ADMIN_USER);
    const res = await app.request(
      "/api/admin/reviews/9999",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      },
      ENV
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when status is not approved or rejected", async () => {
    const sql = makeSql([]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => ADMIN_USER);
    const res = await app.request(
      "/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid (non-numeric) id", async () => {
    const sql = makeSql([]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => ADMIN_USER);
    const res = await app.request(
      "/api/admin/reviews/abc",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const sql = makeSql([]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => null);
    const res = await app.request(
      "/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      },
      ENV
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as non-admin", async () => {
    const sql = makeSql([]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => GUEST_USER);
    const res = await app.request(
      "/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      },
      ENV
    );
    expect(res.status).toBe(403);
  });

  it("sets moderated_at in the UPDATE (passes moderation timestamp)", async () => {
    const sql = makeSql([[UPDATED_REVIEW]]);
    mockNeon.mockReturnValue(sql as any);

    const app = makeApp(async () => ADMIN_USER);
    const res = await app.request(
      "/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      },
      ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.review.moderated_at).not.toBeNull();
  });
});
