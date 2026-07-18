import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import {
  maskDisplayName,
  computeGuestStats,
  createReviewsRouter,
} from "../src/reviews";
import type { User } from "../src/auth/session";

// ---------------------------------------------------------------------------
// maskDisplayName — INV-masked-identity
// ---------------------------------------------------------------------------

describe("maskDisplayName", () => {
  it("formats first_name + last_name as 'Name L.'", () => {
    expect(maskDisplayName("Marie", "Tremblay", "Marie Tremblay")).toBe("Marie T.");
  });

  it("uses only first_name when last_name is null", () => {
    expect(maskDisplayName("Jean", null, "Jean")).toBe("Jean");
  });

  it("uses only first_name when last_name is empty string", () => {
    expect(maskDisplayName("Luc", "", "Luc Bouchard")).toBe("Luc");
  });

  it("falls back to first word of name when first_name is null", () => {
    expect(maskDisplayName(null, null, "Robert Gagnon")).toBe("Robert");
  });

  it("falls back to first word of name when first_name is whitespace-only", () => {
    expect(maskDisplayName("   ", null, "Sylvie Bouchard")).toBe("Sylvie");
  });

  it("handles a single-word name in the fallback path", () => {
    expect(maskDisplayName(null, null, "Monique")).toBe("Monique");
  });

  it("trims whitespace from first_name before formatting", () => {
    expect(maskDisplayName("  Anne  ", "Dupont", "Anne Dupont")).toBe("Anne D.");
  });

  it("uppercases the last initial regardless of input case", () => {
    expect(maskDisplayName("Pierre", "legrand", "Pierre Legrand")).toBe("Pierre L.");
  });

  it("returns empty string when all inputs are empty", () => {
    expect(maskDisplayName(null, null, "")).toBe("");
  });

  it("INV-masked-identity: never exposes full last name in output", () => {
    const result = maskDisplayName("Sophie", "Tremblay-Gagnon", "Sophie Tremblay");
    expect(result).not.toContain("Tremblay");
    expect(result).not.toContain("Gagnon");
    expect(result).toBe("Sophie T.");
  });

  it("INV-masked-identity: fallback exposes only first word of name", () => {
    const result = maskDisplayName(null, null, "François Lapointe");
    expect(result).toBe("François");
    expect(result).not.toContain("Lapointe");
  });
});

// ---------------------------------------------------------------------------
// computeGuestStats — snapshot stays_count / nights_total
// ---------------------------------------------------------------------------

describe("computeGuestStats", () => {
  it("returns stays_count and nights_total from the DB row", async () => {
    const sql = vi.fn().mockResolvedValue([{ stays_count: 3, nights_total: 12 }]);
    const result = await computeGuestStats(sql, null, "guest@example.com");
    expect(result).toEqual({ staysCount: 3, nightsTotal: 12 });
  });

  it("returns zeros when the guest has no confirmed stays yet", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    const result = await computeGuestStats(sql, null, "new@example.com");
    expect(result).toEqual({ staysCount: 0, nightsTotal: 0 });
  });

  it("coerces null stays_count and nights_total to 0", async () => {
    const sql = vi.fn().mockResolvedValue([{ stays_count: null, nights_total: null }]);
    const result = await computeGuestStats(sql, null, "guest@example.com");
    expect(result).toEqual({ staysCount: 0, nightsTotal: 0 });
  });

  it("passes user_id (keyed-by-user_id path) and returns snapshot", async () => {
    const sql = vi.fn().mockResolvedValue([{ stays_count: 2, nights_total: 7 }]);
    const result = await computeGuestStats(sql, 42, "guest@example.com");
    expect(result).toEqual({ staysCount: 2, nightsTotal: 7 });
  });

  it("calls sql exactly once per invocation", async () => {
    const sql = vi.fn().mockResolvedValue([{ stays_count: 1, nights_total: 3 }]);
    await computeGuestStats(sql, null, "once@example.com");
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("snapshot counts first stay as staysCount=1 nightsTotal=nights", async () => {
    const sql = vi.fn().mockResolvedValue([{ stays_count: 1, nights_total: 5 }]);
    const result = await computeGuestStats(sql, null, "first@example.com");
    expect(result.staysCount).toBe(1);
    expect(result.nightsTotal).toBe(5);
  });

  it("snapshot counts returning guest across multiple stays", async () => {
    const sql = vi.fn().mockResolvedValue([{ stays_count: 4, nights_total: 22 }]);
    const result = await computeGuestStats(sql, null, "return@example.com");
    expect(result.staysCount).toBe(4);
    expect(result.nightsTotal).toBe(22);
  });
});

// ---------------------------------------------------------------------------
// HTTP routes — mock neon + rateLimit
// ---------------------------------------------------------------------------

vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(),
}));

vi.mock("../src/auth/rateLimit", () => ({
  rateLimitAllow: vi.fn().mockResolvedValue(true),
}));

type Bindings = { DB_CONN: string };

const ENV: Bindings = { DB_CONN: "postgres://test" };

// Build the Hono app once. mockAuthenticate is configured per test.
const mockAuthenticate = vi.fn<[any], Promise<User | null>>();
const router = createReviewsRouter({ authenticate: mockAuthenticate });
const app = new Hono<{ Bindings: Bindings }>();
app.route("/", router);

let mockNeon: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const mod = await import("@neondatabase/serverless");
  mockNeon = mod.neon as ReturnType<typeof vi.fn>;
  vi.clearAllMocks();
  // After clearAllMocks, restore rate-limit to always-allow default
  const rl = await import("../src/auth/rateLimit");
  vi.mocked(rl.rateLimitAllow).mockResolvedValue(true);
});

// Helper: create a tagged-template mock sql that dispatches on query content
function makeSql(
  script: (query: string, values: unknown[]) => unknown[] | null
) {
  return (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("");
    const result = script(query, values);
    return Promise.resolve(result ?? []);
  };
}

// ---------------------------------------------------------------------------
// GET /api/reviews/eligibility
// ---------------------------------------------------------------------------

describe("GET /api/reviews/eligibility", () => {
  it("returns 400 when code query param is missing", async () => {
    const mockSql = makeSql(() => []);
    mockNeon.mockReturnValue(mockSql);

    const res = await app.request("/api/reviews/eligibility", {}, ENV);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns { eligible: false } for a code that does not exist", async () => {
    const mockSql = makeSql((q) => {
      if (q.includes("FROM reservations")) return []; // not found
      return [];
    });
    mockNeon.mockReturnValue(mockSql);

    const res = await app.request(
      "/api/reviews/eligibility?code=AVP-XXXXXX",
      {},
      ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(body.firstName).toBeUndefined();
  });

  it("returns { eligible: false } for a cancelled reservation", async () => {
    const pastDate = "2025-01-10";
    const mockSql = makeSql((q) => {
      if (q.includes("FROM reservations"))
        return [
          { id: 1, first_name: "Marie", name: "Marie T.", status: "cancelled", depart: pastDate },
        ];
      return [];
    });
    mockNeon.mockReturnValue(mockSql);

    const res = await app.request(
      "/api/reviews/eligibility?code=AVP-CANCEL",
      {},
      ENV
    );
    const body = await res.json();
    expect(body.eligible).toBe(false);
  });

  it("returns { eligible: false } when depart is in the future", async () => {
    const futureDate = "2099-12-31";
    const mockSql = makeSql((q) => {
      if (q.includes("FROM reservations"))
        return [
          { id: 2, first_name: "Jean", name: "Jean D.", status: "confirmed", depart: futureDate },
        ];
      return [];
    });
    mockNeon.mockReturnValue(mockSql);

    const res = await app.request(
      "/api/reviews/eligibility?code=AVP-FUTURE",
      {},
      ENV
    );
    const body = await res.json();
    expect(body.eligible).toBe(false);
  });

  it("returns { eligible: false } when a review already exists for the reservation", async () => {
    const pastDate = "2025-06-01";
    const mockSql = makeSql((q) => {
      if (q.includes("FROM reservations"))
        return [
          { id: 3, first_name: "Luc", name: "Luc B.", status: "confirmed", depart: pastDate },
        ];
      if (q.includes("FROM reviews"))
        return [{ id: 10 }]; // existing review
      return [];
    });
    mockNeon.mockReturnValue(mockSql);

    const res = await app.request(
      "/api/reviews/eligibility?code=AVP-REVU",
      {},
      ENV
    );
    const body = await res.json();
    expect(body.eligible).toBe(false);
  });

  it("returns { eligible: true, firstName } for a valid eligible code", async () => {
    const pastDate = "2025-03-15";
    const mockSql = makeSql((q) => {
      if (q.includes("FROM reservations"))
        return [
          { id: 4, first_name: "Sophie", name: "Sophie R.", status: "confirmed", depart: pastDate },
        ];
      if (q.includes("FROM reviews")) return []; // no review yet
      return [];
    });
    mockNeon.mockReturnValue(mockSql);

    const res = await app.request(
      "/api/reviews/eligibility?code=AVP-VALID1",
      {},
      ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.firstName).toBe("Sophie");
  });

  it("returns eligible:true without firstName when name fields are empty", async () => {
    const pastDate = "2025-05-01";
    const mockSql = makeSql((q) => {
      if (q.includes("FROM reservations"))
        return [
          { id: 5, first_name: null, name: "", status: "confirmed", depart: pastDate },
        ];
      if (q.includes("FROM reviews")) return [];
      return [];
    });
    mockNeon.mockReturnValue(mockSql);

    const res = await app.request(
      "/api/reviews/eligibility?code=AVP-NONAME",
      {},
      ENV
    );
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.firstName).toBeUndefined();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const rl = await import("../src/auth/rateLimit");
    vi.mocked(rl.rateLimitAllow).mockResolvedValue(false);
    mockNeon.mockReturnValue(makeSql(() => []));

    const res = await app.request(
      "/api/reviews/eligibility?code=AVP-RLTEST",
      {},
      ENV
    );
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// POST /api/reviews
// ---------------------------------------------------------------------------

describe("POST /api/reviews", () => {
  const pastDate = "2025-06-20";

  const validReservation = {
    id: 10,
    first_name: "Marie",
    last_name: "Tremblay",
    name: "Marie Tremblay",
    email: "marie@example.com",
    user_id: null,
    status: "confirmed",
    depart: pastDate,
  };

  function makeSubmitSql(
    overrides: Partial<{
      reservation: typeof validReservation | null;
      statsRow: { stays_count: number; nights_total: number } | null;
      insertConflict: boolean;
    }> = {}
  ) {
    const { reservation = validReservation, statsRow = { stays_count: 2, nights_total: 8 }, insertConflict = false } =
      overrides;

    return makeSql((q) => {
      if (q.includes("FROM reservations")) {
        return reservation ? [reservation] : [];
      }
      if (q.includes("COUNT(*)") && q.includes("FROM reservations")) {
        return statsRow ? [statsRow] : [];
      }
      if (q.includes("COUNT(*)") && !q.includes("FROM reservations")) {
        return statsRow ? [statsRow] : [];
      }
      if (q.includes("INSERT INTO reviews")) {
        if (insertConflict) throw Object.assign(new Error("duplicate key value violates unique constraint"), { message: "UNIQUE constraint" });
        return [];
      }
      return [];
    });
  }

  it("returns 400 when code is missing", async () => {
    mockNeon.mockReturnValue(makeSql(() => []));
    const res = await app.request(
      "/api/reviews",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: 5, body: "Excellent séjour!" }) },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when rating is below 1", async () => {
    mockNeon.mockReturnValue(makeSql(() => []));
    const res = await app.request(
      "/api/reviews",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "AVP-ABCDEF", rating: 0, body: "Super séjour merci!" }) },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when rating is above 5", async () => {
    mockNeon.mockReturnValue(makeSql(() => []));
    const res = await app.request(
      "/api/reviews",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "AVP-ABCDEF", rating: 6, body: "Super séjour merci!" }) },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is too short (< 10 chars)", async () => {
    mockNeon.mockReturnValue(makeSql(() => []));
    const res = await app.request(
      "/api/reviews",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "AVP-ABCDEF", rating: 4, body: "Court" }) },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is too long (> 2000 chars)", async () => {
    mockNeon.mockReturnValue(makeSql(() => []));
    const res = await app.request(
      "/api/reviews",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "AVP-ABCDEF", rating: 4, body: "x".repeat(2001) }) },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-GENERIC: returns 400 when code is not found in reservations", async () => {
    const sql = makeSql((q) => {
      if (q.includes("FROM reservations")) return [];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request(
      "/api/reviews",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "AVP-UNKNWN", rating: 5, body: "Séjour magnifique, je recommande!" }) },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-GENERIC: returns 400 for a cancelled reservation", async () => {
    const sql = makeSql((q) => {
      if (q.includes("FROM reservations"))
        return [{ ...validReservation, status: "cancelled" }];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request(
      "/api/reviews",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "AVP-CANCEL", rating: 5, body: "Séjour magnifique merci beaucoup" }) },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-GENERIC: returns 400 when depart is in the future", async () => {
    const sql = makeSql((q) => {
      if (q.includes("FROM reservations"))
        return [{ ...validReservation, depart: "2099-12-31" }];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request(
      "/api/reviews",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "AVP-FUTURE", rating: 5, body: "Séjour magnifique merci beaucoup" }) },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-CONFLICT: returns 409 on duplicate review (unique constraint)", async () => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("");
      if (q.includes("FROM reservations")) return Promise.resolve([validReservation]);
      if (q.includes("COUNT(*)")) return Promise.resolve([{ stays_count: 1, nights_total: 3 }]);
      if (q.includes("INSERT INTO reviews")) {
        const err = new Error("duplicate key value violates unique constraint");
        return Promise.reject(err);
      }
      return Promise.resolve([]);
    };
    mockNeon.mockReturnValue(sql);

    const res = await app.request(
      "/api/reviews",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "AVP-DUPL12", rating: 4, body: "Séjour merveilleux, je reviens bientôt!" }) },
      ENV
    );
    expect(res.status).toBe(409);
  });

  it("returns 201 on successful submission", async () => {
    const sql = makeSql((q) => {
      if (q.includes("FROM reservations")) return [validReservation];
      if (q.includes("COUNT(*)")) return [{ stays_count: 1, nights_total: 3 }];
      if (q.includes("INSERT INTO reviews")) return [];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request(
      "/api/reviews",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "AVP-VALID2", rating: 5, body: "Séjour exceptionnel, personnel accueillant!" }) },
      ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("accepts body at the minimum length boundary (10 chars)", async () => {
    const sql = makeSql((q) => {
      if (q.includes("FROM reservations")) return [validReservation];
      if (q.includes("COUNT(*)")) return [{ stays_count: 1, nights_total: 3 }];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request(
      "/api/reviews",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "AVP-MINLEN", rating: 3, body: "1234567890" }) },
      ENV
    );
    expect(res.status).toBe(201);
  });

  it("accepts body at the maximum length boundary (2000 chars)", async () => {
    const sql = makeSql((q) => {
      if (q.includes("FROM reservations")) return [validReservation];
      if (q.includes("COUNT(*)")) return [{ stays_count: 1, nights_total: 3 }];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request(
      "/api/reviews",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "AVP-MAXLEN", rating: 3, body: "x".repeat(2000) }) },
      ENV
    );
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reviews (public list)
// ---------------------------------------------------------------------------

describe("GET /api/reviews", () => {
  it("returns empty list with null averageRating when no approved reviews exist", async () => {
    const sql = makeSql((q) => {
      if (q.includes("FROM reviews") && q.includes("WHERE status")) return [];
      if (q.includes("COUNT(*)") && q.includes("AVG(rating)"))
        return [{ total: 0, avg_rating: null }];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request("/api/reviews", {}, ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews).toEqual([]);
    expect(body.averageRating).toBeNull();
    expect(body.total).toBe(0);
  });

  it("returns approved reviews in camelCase with rounded averageRating", async () => {
    const reviewRows = [
      {
        id: 1,
        display_name: "Marie T.",
        rating: 5,
        body: "Excellent!",
        stays_count: 2,
        nights_total: 8,
        created_at: "2025-07-01T10:00:00Z",
      },
      {
        id: 2,
        display_name: "Jean B.",
        rating: 4,
        body: "Très bien.",
        stays_count: 1,
        nights_total: 3,
        created_at: "2025-06-15T12:00:00Z",
      },
    ];

    const sql = makeSql((q) => {
      if (q.includes("WHERE status") && q.includes("ORDER BY")) return reviewRows;
      if (q.includes("COUNT(*)") && q.includes("AVG(rating)"))
        return [{ total: 2, avg_rating: "4.5" }];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request("/api/reviews?limit=10", {}, ENV);
    const body = await res.json();

    expect(body.reviews).toHaveLength(2);
    expect(body.reviews[0].displayName).toBe("Marie T.");
    expect(body.reviews[0].staysCount).toBe(2);
    expect(body.reviews[0].nightsTotal).toBe(8);
    expect(body.averageRating).toBe(4.5);
    expect(body.total).toBe(2);
  });

  it("rounds averageRating to 1 decimal place", async () => {
    const sql = makeSql((q) => {
      if (q.includes("WHERE status") && q.includes("ORDER BY"))
        return [
          { id: 1, display_name: "A.", rating: 4, body: "ok", stays_count: 1, nights_total: 2, created_at: "2025-01-01" },
        ];
      if (q.includes("COUNT(*)") && q.includes("AVG(rating)"))
        return [{ total: 3, avg_rating: "4.333333" }];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request("/api/reviews", {}, ENV);
    const body = await res.json();
    expect(body.averageRating).toBe(4.3);
  });

  it("defaults limit to 3 when not specified", async () => {
    let usedLimit: unknown;
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("");
      if (q.includes("LIMIT")) {
        usedLimit = values[values.length - 1];
        return Promise.resolve([]);
      }
      if (q.includes("COUNT(*)")) return Promise.resolve([{ total: 0, avg_rating: null }]);
      return Promise.resolve([]);
    };
    mockNeon.mockReturnValue(sql);

    await app.request("/api/reviews", {}, ENV);
    expect(Number(usedLimit)).toBe(3);
  });

  it("INV-masked-identity: public list never exposes raw name or email fields", async () => {
    const sql = makeSql((q) => {
      if (q.includes("WHERE status") && q.includes("ORDER BY"))
        return [
          { id: 1, display_name: "Marie T.", rating: 5, body: "Super!", stays_count: 1, nights_total: 2, created_at: "2025-01-01" },
        ];
      if (q.includes("COUNT(*)")) return [{ total: 1, avg_rating: "5.0" }];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request("/api/reviews", {}, ENV);
    const body = await res.json();
    const review = body.reviews[0];
    // Only pre-masked display_name is exposed, never first_name/last_name/email
    expect(review).not.toHaveProperty("firstName");
    expect(review).not.toHaveProperty("lastName");
    expect(review).not.toHaveProperty("email");
    expect(review).not.toHaveProperty("first_name");
    expect(review).not.toHaveProperty("last_name");
    expect(review.displayName).toBe("Marie T.");
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/reviews (admin-gated)
// ---------------------------------------------------------------------------

describe("GET /api/admin/reviews", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuthenticate.mockResolvedValue(null);
    mockNeon.mockReturnValue(makeSql(() => []));

    const res = await app.request("/api/admin/reviews", {}, ENV);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    mockAuthenticate.mockResolvedValue({ id: 1, email: "u@example.com", role: "guest" } as User);
    mockNeon.mockReturnValue(makeSql(() => []));

    const res = await app.request("/api/admin/reviews", {}, ENV);
    expect(res.status).toBe(403);
  });

  it("returns reviews filtered by status=pending and pendingCount", async () => {
    mockAuthenticate.mockResolvedValue({ id: 99, email: "admin@example.com", role: "admin" } as User);

    const pendingReviews = [
      {
        id: 5,
        reservation_id: 10,
        rating: 4,
        body: "Bon séjour.",
        status: "pending",
        display_name: "Paul D.",
        stays_count: 1,
        nights_total: 2,
        created_at: "2025-08-01T00:00:00Z",
        moderated_at: null,
        reservation_code: "AVP-ABCDEF",
      },
    ];

    const sql = makeSql((q) => {
      if (q.includes("FROM reviews rv") && q.includes("WHERE rv.status")) return pendingReviews;
      if (q.includes("COUNT(*)") && q.includes("WHERE status")) return [{ count: 3 }];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request("/api/admin/reviews?status=pending", {}, ENV);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].status).toBe("pending");
    expect(body.pendingCount).toBe(3);
  });

  it("defaults to status=pending when no query param given", async () => {
    mockAuthenticate.mockResolvedValue({ id: 99, email: "admin@example.com", role: "admin" } as User);

    let capturedStatus: unknown;
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("");
      if (q.includes("WHERE rv.status")) {
        capturedStatus = values[0];
        return Promise.resolve([]);
      }
      if (q.includes("COUNT(*)")) return Promise.resolve([{ count: 0 }]);
      return Promise.resolve([]);
    };
    mockNeon.mockReturnValue(sql);

    await app.request("/api/admin/reviews", {}, ENV);
    expect(capturedStatus).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/reviews/:id — moderation transitions
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/reviews/:id", () => {
  const adminUser: User = { id: 99, email: "admin@example.com", role: "admin" } as User;

  it("returns 401 when unauthenticated", async () => {
    mockAuthenticate.mockResolvedValue(null);
    mockNeon.mockReturnValue(makeSql(() => []));

    const res = await app.request(
      "/api/admin/reviews/1",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) },
      ENV
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    mockAuthenticate.mockResolvedValue({ id: 1, email: "u@example.com", role: "guest" } as User);
    mockNeon.mockReturnValue(makeSql(() => []));

    const res = await app.request(
      "/api/admin/reviews/1",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) },
      ENV
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-numeric id", async () => {
    mockAuthenticate.mockResolvedValue(adminUser);
    mockNeon.mockReturnValue(makeSql(() => []));

    const res = await app.request(
      "/api/admin/reviews/abc",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-VALIDATION: returns 400 for invalid status value", async () => {
    mockAuthenticate.mockResolvedValue(adminUser);
    mockNeon.mockReturnValue(makeSql(() => []));

    const res = await app.request(
      "/api/admin/reviews/1",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "deleted" }) },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-NOTFOUND: returns 404 when review id does not exist", async () => {
    mockAuthenticate.mockResolvedValue(adminUser);
    const sql = makeSql((q) => {
      if (q.includes("UPDATE reviews")) return []; // no rows updated
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request(
      "/api/admin/reviews/9999",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) },
      ENV
    );
    expect(res.status).toBe(404);
  });

  it("approves a pending review and returns the updated review", async () => {
    mockAuthenticate.mockResolvedValue(adminUser);

    const updatedRow = {
      id: 7,
      reservation_id: 20,
      rating: 5,
      body: "Parfait!",
      status: "approved",
      display_name: "Anne G.",
      stays_count: 1,
      nights_total: 4,
      created_at: "2025-09-01T00:00:00Z",
      moderated_at: "2025-10-01T00:00:00Z",
    };

    const sql = makeSql((q) => {
      if (q.includes("UPDATE reviews")) return [updatedRow];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request(
      "/api/admin/reviews/7",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) },
      ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.review.status).toBe("approved");
    expect(body.review.id).toBe(7);
  });

  it("rejects a pending review and returns updated review", async () => {
    mockAuthenticate.mockResolvedValue(adminUser);

    const updatedRow = {
      id: 8,
      reservation_id: 21,
      rating: 2,
      body: "Pas terrible.",
      status: "rejected",
      display_name: "Marc L.",
      stays_count: 1,
      nights_total: 2,
      created_at: "2025-09-15T00:00:00Z",
      moderated_at: "2025-10-05T00:00:00Z",
    };

    const sql = makeSql((q) => {
      if (q.includes("UPDATE reviews")) return [updatedRow];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request(
      "/api/admin/reviews/8",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "rejected" }) },
      ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.review.status).toBe("rejected");
  });

  it("allows re-moderation: approved → rejected", async () => {
    mockAuthenticate.mockResolvedValue(adminUser);

    const updatedRow = {
      id: 9,
      reservation_id: 22,
      rating: 3,
      body: "Acceptable.",
      status: "rejected",
      display_name: "Claire F.",
      stays_count: 2,
      nights_total: 6,
      created_at: "2025-08-20T00:00:00Z",
      moderated_at: "2025-10-10T00:00:00Z",
    };

    const sql = makeSql((q) => {
      if (q.includes("UPDATE reviews")) return [updatedRow];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request(
      "/api/admin/reviews/9",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "rejected" }) },
      ENV
    );
    const body = await res.json();
    expect(body.review.status).toBe("rejected");
  });

  it("allows re-moderation: rejected → approved", async () => {
    mockAuthenticate.mockResolvedValue(adminUser);

    const updatedRow = {
      id: 11,
      reservation_id: 30,
      rating: 4,
      body: "Bien en fait.",
      status: "approved",
      display_name: "Diane M.",
      stays_count: 1,
      nights_total: 5,
      created_at: "2025-07-10T00:00:00Z",
      moderated_at: "2025-10-12T00:00:00Z",
    };

    const sql = makeSql((q) => {
      if (q.includes("UPDATE reviews")) return [updatedRow];
      return [];
    });
    mockNeon.mockReturnValue(sql);

    const res = await app.request(
      "/api/admin/reviews/11",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) },
      ENV
    );
    const body = await res.json();
    expect(body.review.status).toBe("approved");
  });
});
