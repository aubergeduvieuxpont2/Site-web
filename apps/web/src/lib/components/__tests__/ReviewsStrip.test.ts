import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/svelte";
import ReviewsStrip from "../ReviewsStrip.svelte";

// ReviewsStrip calls fetch("/api/reviews?limit=3") on mount — stub global.fetch.

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
    body: "Séjour extraordinaire ! Personnel aux petits soins.",
    staysCount: 2,
    nightsTotal: 6,
    createdAt: "2026-06-15T10:00:00.000Z",
  },
  {
    id: 2,
    displayName: "Jean-Paul B.",
    rating: 4,
    body: "Très bon accueil. Chambre propre et confortable.",
    staysCount: 1,
    nightsTotal: 3,
    createdAt: "2026-05-20T10:00:00.000Z",
  },
];

beforeEach(() => {
  stubFetch(true, { reviews: SAMPLE_REVIEWS });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// ── Hidden when empty / loading ──────────────────────────────────────────────

describe("ReviewsStrip — hidden states", () => {
  it("does not render the strip before data loads (loaded=false)", () => {
    // Use a never-resolving fetch to stay in loading state
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { queryByTestId } = render(ReviewsStrip);
    expect(queryByTestId("reviews-strip")).toBeNull();
  });

  it("hides the strip when the API returns an empty reviews array", async () => {
    stubFetch(true, { reviews: [] });
    const { queryByTestId } = render(ReviewsStrip);
    await waitFor(() => {
      // After load completes, the strip should still be hidden
      expect(queryByTestId("reviews-strip")).toBeNull();
    });
  });

  it("hides the strip on fetch failure (silent degradation)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Network"))));
    const { queryByTestId } = render(ReviewsStrip);
    await waitFor(() => {
      expect(queryByTestId("reviews-strip")).toBeNull();
    });
  });

  it("hides the strip when the response is not ok", async () => {
    stubFetch(false, { error: "Erreur serveur" });
    const { queryByTestId } = render(ReviewsStrip);
    await waitFor(() => {
      expect(queryByTestId("reviews-strip")).toBeNull();
    });
  });
});

// ── Visible when reviews are present ────────────────────────────────────────

describe("ReviewsStrip — visible state", () => {
  it("renders the strip section when reviews are available", async () => {
    const { findByTestId } = render(ReviewsStrip);
    const strip = await findByTestId("reviews-strip");
    expect(strip.tagName).toBe("SECTION");
  });

  it("renders the section heading", async () => {
    const { findByTestId } = render(ReviewsStrip);
    const heading = await findByTestId("reviews-strip-heading");
    expect(heading.textContent?.trim()).toBe("Ce que disent nos clients");
  });

  it("renders one card per review", async () => {
    const { findAllByTestId } = render(ReviewsStrip);
    const cards = await findAllByTestId("review-strip-card");
    expect(cards).toHaveLength(SAMPLE_REVIEWS.length);
  });

  it("renders the star rating for each review", async () => {
    const { findAllByTestId } = render(ReviewsStrip);
    const stars = await findAllByTestId("review-strip-stars");
    expect(stars[0].getAttribute("aria-label")).toContain("5 sur 5");
  });

  it("renders the review body text", async () => {
    const { findAllByTestId } = render(ReviewsStrip);
    const bodies = await findAllByTestId("review-strip-body");
    expect(bodies[0].textContent).toContain("Séjour extraordinaire");
  });

  it("renders the display_name in the byline (INV-masked-identity)", async () => {
    const { findAllByTestId } = render(ReviewsStrip);
    const bylines = await findAllByTestId("review-strip-byline");
    // Should show masked display_name like "Marie T.", never raw email
    expect(bylines[0].textContent).toContain("Marie T.");
    expect(bylines[0].textContent).not.toContain("@");
  });

  it("shows plural/singular séjours correctly", async () => {
    const { findAllByTestId } = render(ReviewsStrip);
    const bylines = await findAllByTestId("review-strip-byline");
    // First review has staysCount=2 → "2 séjours"
    expect(bylines[0].textContent).toContain("2 séjours");
    // Second review has staysCount=1 → "1 séjour"
    expect(bylines[1].textContent).toContain("1 séjour");
  });

  it("shows plural/singular nuits correctly", async () => {
    const { findAllByTestId } = render(ReviewsStrip);
    const bylines = await findAllByTestId("review-strip-byline");
    expect(bylines[0].textContent).toContain("6 nuits");
    expect(bylines[1].textContent).toContain("3 nuits");
  });

  it("renders a 'Voir tous les avis' link to /avis", async () => {
    const { findByTestId } = render(ReviewsStrip);
    const link = await findByTestId("reviews-strip-all-link");
    expect(link.getAttribute("href")).toBe("/avis");
    expect(link.textContent).toContain("Voir tous les avis");
  });
});

// ── Body excerpt ─────────────────────────────────────────────────────────────

describe("ReviewsStrip — body excerpt", () => {
  it("truncates long review bodies to 200 chars + ellipsis", async () => {
    const longBody = "Mot ".repeat(60); // 240 chars
    stubFetch(true, {
      reviews: [{ ...SAMPLE_REVIEWS[0], body: longBody }],
    });
    const { findAllByTestId } = render(ReviewsStrip);
    const bodies = await findAllByTestId("review-strip-body");
    const text = bodies[0].textContent ?? "";
    expect(text.endsWith("…")).toBe(true);
    // Truncated text + ellipsis = 201 visible chars
    expect(text.length).toBeLessThanOrEqual(201);
  });

  it("leaves short bodies intact (no ellipsis)", async () => {
    stubFetch(true, {
      reviews: [{ ...SAMPLE_REVIEWS[0], body: "Court." }],
    });
    const { findAllByTestId } = render(ReviewsStrip);
    const bodies = await findAllByTestId("review-strip-body");
    expect(bodies[0].textContent?.trim()).toBe("Court.");
  });
});

// ── Star rendering ───────────────────────────────────────────────────────────

describe("ReviewsStrip — star rendering", () => {
  it("renders correct number of filled and empty stars", async () => {
    stubFetch(true, {
      reviews: [{ ...SAMPLE_REVIEWS[0], rating: 3 }],
    });
    const { findAllByTestId } = render(ReviewsStrip);
    const stars = await findAllByTestId("review-strip-stars");
    const text = stars[0].textContent ?? "";
    expect(text).toBe("★★★☆☆");
  });

  it("renders 5 filled stars for a 5-star rating", async () => {
    const { findAllByTestId } = render(ReviewsStrip);
    const stars = await findAllByTestId("review-strip-stars");
    expect(stars[0].textContent).toBe("★★★★★");
  });
});

// ── Fetch parameters ─────────────────────────────────────────────────────────

describe("ReviewsStrip — fetch call", () => {
  it("fetches /api/reviews?limit=3 on mount", async () => {
    const { findByTestId } = render(ReviewsStrip);
    await findByTestId("reviews-strip");
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reviews?limit=3",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
