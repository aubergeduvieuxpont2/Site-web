/**
 * Route-level integration tests for the reviews and eligibility endpoints.
 *
 * These tests drive the exported `app` from index.ts — NOT the createReviewsRouter
 * factory in isolation. If any route is deleted from the app.route() call in
 * index.ts, the test for that route receives 404 and fails, enforcing
 * INV-route-mounted for every review and eligibility endpoint.
 *
 * Unit-level tests for maskDisplayName / computeGuestStats / createReviewsRouter
 * internals live in reviews.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Hoist neon mock before any module resolution ──────────────────────────────
const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () =>
    (strings: TemplateStringsArray, ...values: unknown[]) =>
      neonHolder.sql(strings, ...values),
}));

import { app } from "./index";

const ENV = { DB_CONN: "postgres://stub" } as any;

// A departure date guaranteed to be in the past in all test runs.
const PAST_DEPART = "2026-01-01";

// ── Fixture users ─────────────────────────────────────────────────────────────

const ADMIN_USER = {
  id: 1,
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  hubspot_contact_id: null,
};

const GUEST_USER = {
  id: 2,
  email: "guest@example.com",
  name: "Guest",
  role: "guest",
  hubspot_contact_id: null,
};

// ── SQL mock helpers ──────────────────────────────────────────────────────────

/** No session → unauthenticated. */
function makeAnonSql() {
  return () => Promise.resolve([]);
}

/** Returns a guest user for session lookups (403 path). */
function makeGuestSql() {
  return (strings: TemplateStringsArray) => {
    const q = strings.join(" ");
    if (q.includes("FROM sessions") && q.includes("JOIN users")) {
      return Promise.resolve([GUEST_USER]);
    }
    return Promise.resolve([]);
  };
}

/**
 * SQL mock for authenticated admin requests.
 * `extra` handles domain-specific queries beyond session validation.
 */
function makeAdminSql(extra?: (q: string, vals: unknown[]) => unknown[] | undefined) {
  return (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join(" ");
    if (q.includes("FROM sessions") && q.includes("JOIN users")) {
      return Promise.resolve([ADMIN_USER]);
    }
    const r = extra?.(q, vals);
    return Promise.resolve(r ?? []);
  };
}

/**
 * SQL mock for public (rate-limited) review endpoints.
 * Allows rate limiting (count=1 ≤ limit=30) and routes business queries via `extra`.
 */
function makePublicSql(extra?: (q: string, vals: unknown[]) => unknown[] | undefined) {
  return (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join(" ");
    // Allow rate limit: count=1 is within the 30 req/15 min budget.
    if (q.includes("rate_limits")) {
      return Promise.resolve([{ count: 1 }]);
    }
    const r = extra?.(q, vals);
    return Promise.resolve(r ?? []);
  };
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ELIGIBLE_RESERVATION = {
  id: 42,
  first_name: "Marie",
  last_name: "Tremblay",
  name: "Marie Tremblay",
  email: "marie@example.com",
  user_id: 10,
  status: "confirmed",
  depart: PAST_DEPART,
};

const JSON_HEADERS = { "Content-Type": "application/json" };
const ADMIN_JSON_HEADERS = {
  Cookie: "session=t",
  "Content-Type": "application/json",
};
const ADMIN_HEADERS = { Cookie: "session=t" };

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reviews/eligibility — OP-Reviews.eligibility
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/reviews/eligibility (INV-route-mounted)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 (not 404) when ?code is missing — route is mounted", async () => {
    neonHolder.sql = makePublicSql();
    const res = await app.request(
      "http://localhost/api/reviews/eligibility",
      {},
      ENV
    );
    // 400 means the route matched and validated; 404 would mean it was deleted.
    expect(res.status).toBe(400);
  });

  it("returns { eligible: false } for an unknown code (generic ineligible response)", async () => {
    neonHolder.sql = makePublicSql((q) => {
      if (q.includes("FROM reservations") && q.includes("code")) return [];
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/reviews/eligibility?code=AVP-UNKNOWN",
      {},
      ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.eligible).toBe(false);
    // Generic response: no data leak about why (INV-masked-identity)
    expect(body.name).toBeUndefined();
    expect(body.email).toBeUndefined();
    expect(body.id).toBeUndefined();
  });

  it("returns { eligible: true, firstName } for a valid departed reservation", async () => {
    neonHolder.sql = makePublicSql((q) => {
      if (q.includes("FROM reservations") && q.includes("code")) {
        return [{ id: 42, first_name: "Marie", name: "Marie Tremblay", status: "confirmed", depart: PAST_DEPART }];
      }
      if (q.includes("FROM reviews") && q.includes("reservation_id")) {
        return []; // no existing review
      }
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/reviews/eligibility?code=AVP-ABCDEF",
      {},
      ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.eligible).toBe(true);
    expect(body.firstName).toBe("Marie");
  });

  it("returns { eligible: false } when reservation is cancelled (generic — no reason exposed)", async () => {
    neonHolder.sql = makePublicSql((q) => {
      if (q.includes("FROM reservations") && q.includes("code")) {
        return [{ id: 1, first_name: "Marie", name: "Marie T.", status: "cancelled", depart: PAST_DEPART }];
      }
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/reviews/eligibility?code=AVP-ABCDEF",
      {},
      ENV
    );
    const body = (await res.json()) as any;
    expect(body.eligible).toBe(false);
  });

  it("returns { eligible: false } when a review already exists (INV-one-review-per-reservation)", async () => {
    neonHolder.sql = makePublicSql((q) => {
      if (q.includes("FROM reservations") && q.includes("code")) {
        return [{ id: 1, first_name: "Marie", name: "Marie T.", status: "confirmed", depart: PAST_DEPART }];
      }
      if (q.includes("FROM reviews") && q.includes("reservation_id")) {
        return [{ id: 7 }]; // existing review
      }
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/reviews/eligibility?code=AVP-ABCDEF",
      {},
      ENV
    );
    const body = (await res.json()) as any;
    expect(body.eligible).toBe(false);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    // count=31 > limit=30 → exceeded
    neonHolder.sql = makePublicSql((q) => {
      if (q.includes("rate_limits")) return [{ count: 31 }];
      return undefined;
    });
    // Override the default makePublicSql rate_limit response
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("rate_limits")) return Promise.resolve([{ count: 31 }]);
      return Promise.resolve([]);
    };

    const res = await app.request(
      "http://localhost/api/reviews/eligibility?code=AVP-ABCDEF",
      {},
      ENV
    );
    expect(res.status).toBe(429);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/reviews — OP-Reviews.submit
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/reviews (INV-route-mounted)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const VALID_BODY = {
    code: "AVP-ABCDEF",
    rating: 5,
    body: "Excellent séjour, je recommande vivement!",
  };

  it("returns 201 { ok: true } on a valid submission — route is mounted", async () => {
    neonHolder.sql = makePublicSql((q) => {
      if (q.includes("FROM reservations") && q.includes("code")) {
        return [ELIGIBLE_RESERVATION];
      }
      if (q.includes("stays_count") || q.includes("nights_total")) {
        return [{ stays_count: 2, nights_total: 7 }];
      }
      if (q.includes("INSERT INTO reviews")) {
        return [];
      }
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/reviews",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(VALID_BODY),
      },
      ENV
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  it("returns 400 for an ineligible code (ERR-BADREQUEST)", async () => {
    neonHolder.sql = makePublicSql((q) => {
      if (q.includes("FROM reservations") && q.includes("code")) return [];
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/reviews",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(VALID_BODY),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when a review already exists for this reservation (ERR-CONFLICT / INV-one-review)", async () => {
    // Note: INSERT INTO reviews also contains "stays_count" in its column list,
    // so check INSERT first to avoid the stats pattern matching it.
    neonHolder.sql = makePublicSql((q) => {
      if (q.includes("INSERT INTO reviews")) {
        throw new Error("duplicate key value violates unique constraint");
      }
      if (q.includes("FROM reservations") && q.includes("code")) {
        return [ELIGIBLE_RESERVATION];
      }
      if (q.includes("stays_count") || q.includes("nights_total")) {
        return [{ stays_count: 1, nights_total: 3 }];
      }
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/reviews",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(VALID_BODY),
      },
      ENV
    );
    expect(res.status).toBe(409);
  });

  it("returns 400 when rating is out of range (validation)", async () => {
    neonHolder.sql = makePublicSql();

    const res = await app.request(
      "http://localhost/api/reviews",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 6, body: "Commentaire suffisamment long." }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is too short (< 10 chars)", async () => {
    neonHolder.sql = makePublicSql();

    const res = await app.request(
      "http://localhost/api/reviews",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ code: "AVP-ABCDEF", rating: 4, body: "Court" }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reviews — OP-Reviews.listPublic
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/reviews (INV-route-mounted)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with reviews array, averageRating, and total — route is mounted", async () => {
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("FROM reviews") && q.includes("status = 'approved'") && !q.includes("COUNT")) {
        return Promise.resolve([
          {
            id: 1,
            display_name: "Marie T.",
            rating: 5,
            body: "Super séjour!",
            stays_count: 2,
            nights_total: 7,
            created_at: "2026-06-01T00:00:00Z",
          },
        ]);
      }
      if (q.includes("COUNT(*)::int AS total") || q.includes("AVG(rating)")) {
        return Promise.resolve([{ total: 1, avg_rating: "5.0" }]);
      }
      return Promise.resolve([]);
    };

    const res = await app.request("http://localhost/api/reviews", {}, ENV);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(Array.isArray(body.reviews)).toBe(true);
    expect(body).toHaveProperty("averageRating");
    expect(body).toHaveProperty("total");
  });

  it("returns averageRating: null when no approved reviews exist", async () => {
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("FROM reviews")) {
        return Promise.resolve([{ total: 0, avg_rating: null }]);
      }
      return Promise.resolve([]);
    };

    const res = await app.request("http://localhost/api/reviews", {}, ENV);
    const body = (await res.json()) as any;
    expect(body.averageRating).toBeNull();
  });

  it("does not expose raw name/email fields (INV-masked-identity)", async () => {
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("FROM reviews") && !q.includes("COUNT")) {
        return Promise.resolve([
          { id: 1, display_name: "Jean D.", rating: 4, body: "Bon séjour.", stays_count: 1, nights_total: 3, created_at: "2026-01-01T00:00:00Z" },
        ]);
      }
      return Promise.resolve([{ total: 1, avg_rating: "4.0" }]);
    };

    const res = await app.request("http://localhost/api/reviews", {}, ENV);
    const body = (await res.json()) as any;
    const review = body.reviews[0];
    expect(review.email).toBeUndefined();
    expect(review.name).toBeUndefined();
    expect(review.display_name).toBeUndefined();
    expect(review.displayName).toBe("Jean D.");
  });

  it("returns 429 when rate limit is exceeded (MINOR-A parity)", async () => {
    // count=31 > limit=30 → exceeded. Mirrors the eligibility/POST rate-limit guard.
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("rate_limits")) return Promise.resolve([{ count: 31 }]);
      return Promise.resolve([]);
    };

    const res = await app.request("http://localhost/api/reviews", {}, ENV);
    expect(res.status).toBe(429);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/reviews — OP-Reviews.listAdmin
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/admin/reviews (INV-route-mounted)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 (not 404) when not authenticated — route is mounted", async () => {
    neonHolder.sql = makeAnonSql();
    const res = await app.request("http://localhost/api/admin/reviews", {}, ENV);
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as non-admin", async () => {
    neonHolder.sql = makeGuestSql();
    const res = await app.request(
      "http://localhost/api/admin/reviews",
      { headers: ADMIN_HEADERS },
      ENV
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with reviews and pendingCount for an admin", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("FROM reviews rv") || q.includes("JOIN reservations res")) {
        return [
          {
            id: 1,
            reservation_id: 10,
            rating: 4,
            body: "Bon séjour.",
            status: "pending",
            display_name: "Marie T.",
            stays_count: 1,
            nights_total: 3,
            created_at: "2026-06-01T00:00:00Z",
            moderated_at: null,
            reservation_code: "AVP-ABCDEF",
          },
        ];
      }
      if (q.includes("COUNT(*)::int AS count") && q.includes("status = 'pending'")) {
        return [{ count: 1 }];
      }
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/admin/reviews",
      { headers: ADMIN_HEADERS },
      ENV
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(Array.isArray(body.reviews)).toBe(true);
    expect(typeof body.pendingCount).toBe("number");
  });

  it("defaults to pending status filter", async () => {
    const captured: string[] = [];
    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("FROM sessions") && q.includes("JOIN users")) {
        return Promise.resolve([ADMIN_USER]);
      }
      captured.push(...(vals as string[]));
      return Promise.resolve([]);
    };

    await app.request(
      "http://localhost/api/admin/reviews",
      { headers: ADMIN_HEADERS },
      ENV
    );
    expect(captured).toContain("pending");
  });

  it("passes through ?status=approved filter", async () => {
    const captured: string[] = [];
    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("FROM sessions") && q.includes("JOIN users")) {
        return Promise.resolve([ADMIN_USER]);
      }
      captured.push(...(vals as string[]));
      return Promise.resolve([]);
    };

    await app.request(
      "http://localhost/api/admin/reviews?status=approved",
      { headers: ADMIN_HEADERS },
      ENV
    );
    expect(captured).toContain("approved");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/reviews/:id — OP-Reviews.moderate
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/admin/reviews/:id (INV-route-mounted)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const MODERATED_REVIEW = {
    id: 5,
    reservation_id: 10,
    rating: 4,
    body: "Bon séjour.",
    status: "approved",
    display_name: "Marie T.",
    stays_count: 1,
    nights_total: 3,
    created_at: "2026-06-01T00:00:00Z",
    moderated_at: "2026-07-01T10:00:00Z",
  };

  it("returns 401 (not 404) when not authenticated — route is mounted", async () => {
    neonHolder.sql = makeAnonSql();
    const res = await app.request(
      "http://localhost/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ status: "approved" }),
      },
      ENV
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as non-admin", async () => {
    neonHolder.sql = makeGuestSql();
    const res = await app.request(
      "http://localhost/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ status: "approved" }),
      },
      ENV
    );
    expect(res.status).toBe(403);
  });

  it("approves a review and returns the updated review (pending → approved)", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("UPDATE reviews") && q.includes("RETURNING")) {
        return [MODERATED_REVIEW];
      }
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ status: "approved" }),
      },
      ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.review.status).toBe("approved");
    expect(body.review.id).toBe(5);
  });

  it("rejects a review (moderation transition: pending → rejected)", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("UPDATE reviews") && q.includes("RETURNING")) {
        return [{ ...MODERATED_REVIEW, status: "rejected" }];
      }
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ status: "rejected" }),
      },
      ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.review.status).toBe("rejected");
  });

  it("allows re-moderation: approved → rejected", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("UPDATE reviews") && q.includes("RETURNING")) {
        return [{ ...MODERATED_REVIEW, status: "rejected" }];
      }
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ status: "rejected" }),
      },
      ENV
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when review does not exist (ERR-NOTFOUND)", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("UPDATE reviews") && q.includes("RETURNING")) return [];
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/admin/reviews/9999",
      {
        method: "PATCH",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ status: "approved" }),
      },
      ENV
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid status value (ERR-BADREQUEST)", async () => {
    neonHolder.sql = makeAdminSql();

    const res = await app.request(
      "http://localhost/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ status: "pending" }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-numeric :id param (ERR-BADREQUEST)", async () => {
    neonHolder.sql = makeAdminSql();

    const res = await app.request(
      "http://localhost/api/admin/reviews/abc",
      {
        method: "PATCH",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ status: "approved" }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("includes moderated_at in the response (set by server)", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("UPDATE reviews") && q.includes("RETURNING")) {
        return [MODERATED_REVIEW];
      }
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/admin/reviews/5",
      {
        method: "PATCH",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ status: "approved" }),
      },
      ENV
    );
    const body = (await res.json()) as any;
    expect(body.review.moderated_at).not.toBeNull();
  });
});
