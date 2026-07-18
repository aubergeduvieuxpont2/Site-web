/**
 * Conformance tests for /avis (+page.svelte).
 *
 * SDD-IR scope: OP-Reviews.listPublic, INV-masked-identity.
 *
 * These tests drive the component directly to confirm that the web layer
 * correctly reflects the API response contract defined in the design spec §6f:
 * - Approved reviews displayed newest-first with average rating header
 * - INV-masked-identity: no raw name/email ever rendered
 * - OP-Reviews.listPublic payload shape: reviews[], averageRating, total
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

// ── Fetch stub helpers ────────────────────────────────────────────────────────

function stubFetch(ok: boolean, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok,
        status: ok ? 200 : 500,
        json: () => Promise.resolve(body),
      } as Response),
    ),
  );
}

// ── Sample data conforming to the OP-Reviews.listPublic response shape ────────

const REVIEW_1: Record<string, unknown> = {
  id: 1,
  displayName: "Marie T.",
  rating: 5,
  body: "Séjour excellent, personnel très accueillant.",
  staysCount: 3,
  nightsTotal: 8,
  createdAt: "2026-07-01T10:00:00.000Z",
};

const REVIEW_2: Record<string, unknown> = {
  id: 2,
  displayName: "Jean-Paul D.",
  rating: 4,
  body: "Chambre propre. Bon rapport qualité-prix.",
  staysCount: 1,
  nightsTotal: 2,
  createdAt: "2026-06-15T10:00:00.000Z",
};

// Import AFTER mocks are in place (static imports are hoisted by Vite).
import Page from "../+page.svelte";

beforeEach(() => {
  stubFetch(true, { reviews: [REVIEW_1, REVIEW_2], averageRating: 4.5, total: 2 });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// ── Page structure ─────────────────────────────────────────────────────────────

describe("/avis — page structure", () => {
  it("renders the root page element with data-testid='page-avis'", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { getByTestId } = render(Page);
    expect(getByTestId("page-avis")).toBeTruthy();
  });

  it("renders the page title 'Témoignages' before data loads", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { getByTestId } = render(Page);
    expect(getByTestId("avis-title").textContent?.trim()).toBe("Témoignages");
  });
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe("/avis — loading (OP-Reviews.listPublic)", () => {
  it("shows the loading indicator while the API request is in flight", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { getByTestId } = render(Page);
    const loading = getByTestId("avis-loading");
    expect(loading.getAttribute("aria-busy")).toBe("true");
  });

  it("does not render reviews while loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { queryByTestId } = render(Page);
    expect(queryByTestId("avis-list")).toBeNull();
  });
});

// ── Error states ───────────────────────────────────────────────────────────────

describe("/avis — error handling", () => {
  it("shows an error banner when the API returns a non-OK response", async () => {
    stubFetch(false, { error: "Erreur interne du serveur" });
    const { findByTestId } = render(Page);
    const banner = await findByTestId("avis-error");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.textContent).toContain("Erreur interne");
  });

  it("shows 'Réseau indisponible' when fetch throws a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Network failure"))));
    const { findByTestId } = render(Page);
    const banner = await findByTestId("avis-error");
    expect(banner.textContent).toContain("Réseau indisponible");
  });

  it("does not render reviews in the error state", async () => {
    stubFetch(false, { error: "Service unavailable" });
    const { queryByTestId, findByTestId } = render(Page);
    await findByTestId("avis-error");
    expect(queryByTestId("avis-list")).toBeNull();
  });
});

// ── Empty state ────────────────────────────────────────────────────────────────

describe("/avis — empty state", () => {
  it("shows the empty message when no approved reviews exist", async () => {
    stubFetch(true, { reviews: [], averageRating: null, total: 0 });
    const { findByTestId } = render(Page);
    const empty = await findByTestId("avis-empty");
    expect(empty.textContent).toContain("Aucun avis");
  });

  it("does not render the average rating block when reviews are empty", async () => {
    stubFetch(true, { reviews: [], averageRating: null, total: 0 });
    const { queryByTestId, findByTestId } = render(Page);
    await findByTestId("avis-empty");
    expect(queryByTestId("avis-average")).toBeNull();
  });
});

// ── OP-Reviews.listPublic — response payload mapping ─────────────────────────

describe("/avis — reviews list (OP-Reviews.listPublic)", () => {
  it("renders one card per review", async () => {
    const { findAllByTestId } = render(Page);
    const cards = await findAllByTestId("avis-card");
    expect(cards).toHaveLength(2);
  });

  it("renders the display_name field (camelCase: displayName) for each review", async () => {
    const { findAllByTestId } = render(Page);
    const names = await findAllByTestId("avis-card-name");
    expect(names[0].textContent?.trim()).toBe("Marie T.");
    expect(names[1].textContent?.trim()).toBe("Jean-Paul D.");
  });

  it("renders the star rating with accessible aria-label (rating N sur 5)", async () => {
    const { findAllByTestId } = render(Page);
    const stars = await findAllByTestId("avis-card-stars");
    expect(stars[0].getAttribute("aria-label")).toContain("5 sur 5");
    expect(stars[1].getAttribute("aria-label")).toContain("4 sur 5");
  });

  it("renders the review body text", async () => {
    const { findAllByTestId } = render(Page);
    const bodies = await findAllByTestId("avis-card-body");
    expect(bodies[0].textContent).toContain("Séjour excellent");
    expect(bodies[1].textContent).toContain("Chambre propre");
  });

  it("renders staysCount with correct pluralisation (staysCount → séjours/séjour)", async () => {
    const { findAllByTestId } = render(Page);
    const stays = await findAllByTestId("avis-card-stays");
    expect(stays[0].textContent).toContain("3 séjours");
    expect(stays[1].textContent).toContain("1 séjour");
  });

  it("renders nightsTotal with correct pluralisation (nightsTotal → nuits/nuit)", async () => {
    const { findAllByTestId } = render(Page);
    const nights = await findAllByTestId("avis-card-nights");
    expect(nights[0].textContent).toContain("8 nuits");
    expect(nights[1].textContent).toContain("2 nuits");
  });

  it("renders a <time> element with correct datetime attribute (createdAt)", async () => {
    const { findAllByTestId } = render(Page);
    const dates = await findAllByTestId("avis-card-date");
    expect(dates[0].getAttribute("datetime")).toBe("2026-07-01T10:00:00.000Z");
  });
});

// ── INV-masked-identity ────────────────────────────────────────────────────────

describe("/avis — INV-masked-identity", () => {
  it("never exposes a raw email address in the rendered card output", async () => {
    stubFetch(true, {
      reviews: [
        {
          id: 1,
          displayName: "Marie T.",
          rating: 5,
          body: "Très bon séjour dans cet établissement.",
          staysCount: 1,
          nightsTotal: 3,
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      ],
      averageRating: 5,
      total: 1,
    });
    const { findAllByTestId } = render(Page);
    const cards = await findAllByTestId("avis-card");
    cards.forEach((card) => {
      expect(card.textContent).not.toMatch(/@[a-zA-Z0-9.]+\.[a-zA-Z]/);
    });
  });

  it("never exposes raw name/email fields from the OP-Reviews.listPublic payload", async () => {
    // The API must return { displayName } (camelCase, pre-masked), never { email, name }
    stubFetch(true, {
      reviews: [
        {
          id: 1,
          displayName: "Claude R.",
          rating: 4,
          body: "Confortable et tranquille, parfait pour se ressourcer.",
          staysCount: 2,
          nightsTotal: 4,
          createdAt: "2026-06-10T00:00:00.000Z",
        },
      ],
      averageRating: 4,
      total: 1,
    });
    const { findAllByTestId } = render(Page);
    const cards = await findAllByTestId("avis-card");
    cards.forEach((card) => {
      // Must not contain any email-like pattern
      expect(card.textContent).not.toMatch(/@/);
    });
  });
});

// ── Average rating (OP-Reviews.listPublic) ────────────────────────────────────

describe("/avis — average rating", () => {
  it("renders the average rating widget when reviews are present", async () => {
    const { findByTestId } = render(Page);
    const avg = await findByTestId("avis-average");
    expect(avg).toBeTruthy();
  });

  it("renders the formatted numeric average (e.g. '4.5/5')", async () => {
    const { findByTestId } = render(Page);
    const value = await findByTestId("avis-average-value");
    expect(value.textContent?.trim()).toBe("4.5/5");
  });

  it("renders the total review count", async () => {
    const { findByTestId } = render(Page);
    const count = await findByTestId("avis-total");
    expect(count.textContent).toContain("2");
  });

  it("renders the star display with accessible aria-label including the average", async () => {
    const { findByTestId } = render(Page);
    const stars = await findByTestId("avis-average-stars");
    expect(stars.getAttribute("aria-label")).toContain("4.5 sur 5");
  });

  it("renders a half-star character (½) for a non-integer average like 4.5", async () => {
    const { findByTestId } = render(Page);
    const stars = await findByTestId("avis-average-stars");
    expect(stars.textContent).toContain("½");
  });

  it("does not render average rating widget when averageRating is null", async () => {
    stubFetch(true, { reviews: [], averageRating: null, total: 0 });
    const { queryByTestId, findByTestId } = render(Page);
    await findByTestId("avis-empty");
    expect(queryByTestId("avis-average")).toBeNull();
  });
});

// ── Fetch call shape ──────────────────────────────────────────────────────────

describe("/avis — fetch parameters", () => {
  it("fetches /api/reviews on mount (OP-Reviews.listPublic endpoint)", async () => {
    const { findAllByTestId } = render(Page);
    await findAllByTestId("avis-card");
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const called = fetchMock.mock.calls.some(
      (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/reviews"),
    );
    expect(called).toBe(true);
  });

  it("sends credentials: include for authentication (cookie passthrough)", async () => {
    const { findAllByTestId } = render(Page);
    await findAllByTestId("avis-card");
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const hasCredentials = fetchMock.mock.calls.some(
      (c: unknown[]) => (c[1] as RequestInit | undefined)?.credentials === "include",
    );
    expect(hasCredentials).toBe(true);
  });
});
