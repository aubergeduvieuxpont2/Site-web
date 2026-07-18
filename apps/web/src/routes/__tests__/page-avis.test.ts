import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

// The /avis page uses raw fetch on mount — stub global.fetch before each test.

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

const SAMPLE_REVIEWS = [
  {
    id: 1,
    displayName: "Marie T.",
    rating: 5,
    body: "Excellent séjour. Personnel chaleureux et attentionné.",
    staysCount: 3,
    nightsTotal: 8,
    createdAt: "2026-07-01T10:00:00.000Z",
  },
  {
    id: 2,
    displayName: "Claude R.",
    rating: 4,
    body: "Chambre confortable. Bon rapport qualité-prix.",
    staysCount: 1,
    nightsTotal: 2,
    createdAt: "2026-06-15T10:00:00.000Z",
  },
];

beforeEach(() => {
  stubFetch(true, { reviews: SAMPLE_REVIEWS, averageRating: 4.5, total: 2 });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// Import AFTER stubs are registered (hoisting order safety — dynamic import is fine for modules).
import Page from "../avis/+page.svelte";

// ── Loading state ────────────────────────────────────────────────────────────

describe("page /avis — loading", () => {
  it("shows the loading indicator while the request is in flight", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { getByTestId } = render(Page);
    const loading = getByTestId("avis-loading");
    expect(loading.getAttribute("aria-busy")).toBe("true");
  });

  it("renders the page title immediately before data loads", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { getByTestId } = render(Page);
    expect(getByTestId("avis-title").textContent?.trim()).toBe("Témoignages");
  });
});

// ── Error state ──────────────────────────────────────────────────────────────

describe("page /avis — error state", () => {
  it("shows an error banner when the API returns a non-OK response", async () => {
    stubFetch(false, { error: "Erreur interne" });
    const { findByTestId } = render(Page);
    const banner = await findByTestId("avis-error");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.textContent).toContain("Erreur interne");
  });

  it("shows the network error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Network"))));
    const { findByTestId } = render(Page);
    const banner = await findByTestId("avis-error");
    expect(banner.textContent).toContain("Réseau indisponible");
  });
});

// ── Empty state ──────────────────────────────────────────────────────────────

describe("page /avis — empty state", () => {
  it("shows the empty message when no approved reviews exist", async () => {
    stubFetch(true, { reviews: [], averageRating: null, total: 0 });
    const { findByTestId } = render(Page);
    const empty = await findByTestId("avis-empty");
    expect(empty.textContent).toContain("Aucun avis");
  });

  it("does not render the average rating when reviews are empty", async () => {
    stubFetch(true, { reviews: [], averageRating: null, total: 0 });
    const { queryByTestId, findByTestId } = render(Page);
    await findByTestId("avis-empty");
    expect(queryByTestId("avis-average")).toBeNull();
  });
});

// ── Reviews list ─────────────────────────────────────────────────────────────

describe("page /avis — reviews list", () => {
  it("renders one card per review", async () => {
    const { findAllByTestId } = render(Page);
    const cards = await findAllByTestId("avis-card");
    expect(cards).toHaveLength(2);
  });

  it("renders the display_name for each review (INV-masked-identity)", async () => {
    const { findAllByTestId } = render(Page);
    const names = await findAllByTestId("avis-card-name");
    expect(names[0].textContent?.trim()).toBe("Marie T.");
    expect(names[0].textContent).not.toContain("@");
  });

  it("renders the star rating with an accessible aria-label", async () => {
    const { findAllByTestId } = render(Page);
    const stars = await findAllByTestId("avis-card-stars");
    expect(stars[0].getAttribute("aria-label")).toContain("5 sur 5");
  });

  it("renders the review body text", async () => {
    const { findAllByTestId } = render(Page);
    const bodies = await findAllByTestId("avis-card-body");
    expect(bodies[0].textContent).toContain("Excellent séjour");
  });

  it("renders stays count metadata", async () => {
    const { findAllByTestId } = render(Page);
    const stays = await findAllByTestId("avis-card-stays");
    expect(stays[0].textContent).toContain("3 séjours");
    expect(stays[1].textContent).toContain("1 séjour");
  });

  it("renders nights total metadata", async () => {
    const { findAllByTestId } = render(Page);
    const nights = await findAllByTestId("avis-card-nights");
    expect(nights[0].textContent).toContain("8 nuits");
    expect(nights[1].textContent).toContain("2 nuits");
  });

  it("renders a date for each review", async () => {
    const { findAllByTestId } = render(Page);
    const dates = await findAllByTestId("avis-card-date");
    expect(dates[0].getAttribute("datetime")).toBe("2026-07-01T10:00:00.000Z");
  });
});

// ── Average rating ────────────────────────────────────────────────────────────

describe("page /avis — average rating", () => {
  it("renders the average rating widget when reviews exist", async () => {
    const { findByTestId } = render(Page);
    const avg = await findByTestId("avis-average");
    expect(avg).toBeTruthy();
  });

  it("renders the formatted numeric average rating", async () => {
    const { findByTestId } = render(Page);
    const avgValue = await findByTestId("avis-average-value");
    expect(avgValue.textContent?.trim()).toBe("4.5/5");
  });

  it("renders the total count of reviews", async () => {
    const { findByTestId } = render(Page);
    const count = await findByTestId("avis-total");
    expect(count.textContent).toContain("2");
  });

  it("renders accessible aria-label on the average star display", async () => {
    const { findByTestId } = render(Page);
    const stars = await findByTestId("avis-average-stars");
    expect(stars.getAttribute("aria-label")).toContain("4.5 sur 5");
  });

  it("shows half-star in the partial star display for non-integer average", async () => {
    const { findByTestId } = render(Page);
    const stars = await findByTestId("avis-average-stars");
    // 4.5 → 4 full stars + half + 0 empty
    expect(stars.textContent).toContain("½");
  });
});

// ── Page structure ────────────────────────────────────────────────────────────

describe("page /avis — structure", () => {
  it("renders the root page element with testid", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { getByTestId } = render(Page);
    expect(getByTestId("page-avis")).toBeTruthy();
  });

  it("does not expose raw email or identity data (INV-masked-identity)", async () => {
    const { findAllByTestId } = render(Page);
    const cards = await findAllByTestId("avis-card");
    // None of the cards should contain an email address
    cards.forEach((card) => {
      expect(card.textContent).not.toMatch(/@[a-zA-Z0-9.]+\.[a-zA-Z]/);
    });
  });
});
