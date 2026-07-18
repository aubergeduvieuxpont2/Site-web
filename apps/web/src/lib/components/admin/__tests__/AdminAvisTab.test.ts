import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import AdminAvisTab from "../AdminAvisTab.svelte";

// ---------------------------------------------------------------------------
// AdminAvisTab uses raw fetch — stub global.fetch before each test.
// ---------------------------------------------------------------------------

function makeFetch(ok: boolean, body: unknown) {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 400,
      json: () => Promise.resolve(body),
    } as Response),
  );
}

const PENDING_REVIEW = {
  id: 1,
  reservation_id: 10,
  reservation_code: "AVP-ABC123",
  rating: 4,
  body: "Excellent séjour, personnel accueillant.",
  status: "pending" as const,
  display_name: "Marie T.",
  stays_count: 2,
  nights_total: 5,
  created_at: "2026-07-01T10:00:00.000Z",
  moderated_at: null,
};

const APPROVED_REVIEW = { ...PENDING_REVIEW, id: 2, status: "approved" as const, moderated_at: "2026-07-02T10:00:00.000Z" };
const REJECTED_REVIEW = { ...PENDING_REVIEW, id: 3, status: "rejected" as const };

beforeEach(() => {
  // Default: fetch returns one pending review
  vi.stubGlobal(
    "fetch",
    makeFetch(true, { reviews: [PENDING_REVIEW], pendingCount: 1 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// ── Loading & initial state ──────────────────────────────────────────────────

describe("AdminAvisTab — loading", () => {
  it("shows a loading spinner while the request is in flight", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})), // never resolves
    );
    const { getByTestId } = render(AdminAvisTab);
    const loading = getByTestId("avis-loading");
    expect(loading.getAttribute("aria-busy")).toBe("true");
  });

  it("renders the filter bar immediately (before data arrives)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { getByTestId } = render(AdminAvisTab);
    expect(getByTestId("filter-pending")).toBeTruthy();
    expect(getByTestId("filter-approved")).toBeTruthy();
    expect(getByTestId("filter-rejected")).toBeTruthy();
  });
});

// ── Empty state ──────────────────────────────────────────────────────────────

describe("AdminAvisTab — empty state", () => {
  it("shows the empty message when the list is empty", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch(true, { reviews: [], pendingCount: 0 }),
    );
    const { findByTestId } = render(AdminAvisTab);
    const empty = await findByTestId("avis-empty");
    expect(empty.textContent).toContain("Aucun avis");
  });
});

// ── Error state ──────────────────────────────────────────────────────────────

describe("AdminAvisTab — error state", () => {
  it("shows an error banner when the API returns an error response", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch(false, { error: "Accès refusé" }),
    );
    const { findByTestId } = render(AdminAvisTab);
    const banner = await findByTestId("avis-error");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.textContent).toContain("Accès refusé");
  });

  it("shows a network error message when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Network failure"))),
    );
    const { findByTestId } = render(AdminAvisTab);
    const banner = await findByTestId("avis-error");
    expect(banner.textContent).toContain("Réseau indisponible");
  });
});

// ── Review list rendering ────────────────────────────────────────────────────

describe("AdminAvisTab — review list", () => {
  it("renders one card per review", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch(true, {
        reviews: [PENDING_REVIEW, APPROVED_REVIEW],
        pendingCount: 1,
      }),
    );
    const { findAllByTestId } = render(AdminAvisTab);
    const cards = await findAllByTestId("review-card");
    expect(cards).toHaveLength(2);
  });

  it("renders the display_name, masked and not raw email", async () => {
    const { findByTestId } = render(AdminAvisTab);
    const name = await findByTestId("review-display-name");
    expect(name.textContent?.trim()).toBe("Marie T.");
    // Invariant: never shows raw email in the output
    expect(name.textContent).not.toContain("@");
  });

  it("renders the reservation code", async () => {
    const { findByTestId } = render(AdminAvisTab);
    const code = await findByTestId("review-code");
    expect(code.textContent?.trim()).toBe("AVP-ABC123");
  });

  it("renders the star rating with aria-label", async () => {
    const { findByTestId } = render(AdminAvisTab);
    const stars = await findByTestId("review-rating");
    expect(stars.getAttribute("aria-label")).toContain("4 sur 5");
  });

  it("renders the review body text", async () => {
    const { findByTestId } = render(AdminAvisTab);
    const body = await findByTestId("review-body");
    expect(body.textContent).toContain("Excellent séjour");
  });

  it("renders stays and nights metadata", async () => {
    const { findByTestId } = render(AdminAvisTab);
    const stays = await findByTestId("review-stays");
    expect(stays.textContent).toContain("2 séjours");
    expect(stays.textContent).toContain("5 nuits");
  });
});

// ── Pending badge ────────────────────────────────────────────────────────────

describe("AdminAvisTab — pending badge", () => {
  it("shows the pending count badge when pendingCount > 0", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch(true, { reviews: [PENDING_REVIEW], pendingCount: 3 }),
    );
    const { getByTestId, findAllByTestId } = render(AdminAvisTab);
    // Wait for the data to load
    await findAllByTestId("review-card");
    // The pending filter button should show a badge
    const pendingBtn = getByTestId("filter-pending");
    expect(pendingBtn.querySelector(".avis-tab__badge")).toBeTruthy();
  });

  it("does not show the badge when pendingCount is 0", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch(true, { reviews: [], pendingCount: 0 }),
    );
    const { getByTestId, findByTestId } = render(AdminAvisTab);
    await findByTestId("avis-empty");
    const pendingBtn = getByTestId("filter-pending");
    expect(pendingBtn.querySelector(".avis-tab__badge")).toBeNull();
  });
});

// ── Moderation actions ───────────────────────────────────────────────────────

describe("AdminAvisTab — moderation", () => {
  it("shows Approuver and Rejeter for a pending review", async () => {
    const { findByTestId } = render(AdminAvisTab);
    await findByTestId("review-card");
    expect(document.querySelector("[data-testid='btn-approuver']")).toBeTruthy();
    expect(document.querySelector("[data-testid='btn-rejeter']")).toBeTruthy();
  });

  it("hides Approuver for an already-approved review", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch(true, { reviews: [APPROVED_REVIEW], pendingCount: 0 }),
    );
    const { findByTestId } = render(AdminAvisTab);
    await findByTestId("review-card");
    expect(document.querySelector("[data-testid='btn-approuver']")).toBeNull();
    expect(document.querySelector("[data-testid='btn-rejeter']")).toBeTruthy();
  });

  it("hides Rejeter for an already-rejected review", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch(true, { reviews: [REJECTED_REVIEW], pendingCount: 0 }),
    );
    const { findByTestId } = render(AdminAvisTab);
    await findByTestId("review-card");
    expect(document.querySelector("[data-testid='btn-approuver']")).toBeTruthy();
    expect(document.querySelector("[data-testid='btn-rejeter']")).toBeNull();
  });

  it("calls PATCH /api/admin/reviews/:id with status=approved when Approuver is clicked", async () => {
    const updatedReview = { ...PENDING_REVIEW, status: "approved" };
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, opts?: RequestInit) => {
        callCount++;
        if (opts?.method === "PATCH") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ review: updatedReview, reviews: [updatedReview], pendingCount: 0 }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ reviews: [PENDING_REVIEW], pendingCount: 1 }),
        } as Response);
      }),
    );

    const { findByTestId } = render(AdminAvisTab);
    const approveBtn = await findByTestId("btn-approuver");
    await fireEvent.click(approveBtn);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const patchCall = calls.find(
        ([u, o]: [string, RequestInit]) => o?.method === "PATCH",
      );
      expect(patchCall).toBeTruthy();
      expect(patchCall[0]).toContain("/api/admin/reviews/1");
      expect(JSON.parse(patchCall[1].body as string)).toEqual({ status: "approved" });
    });
  });

  it("calls PATCH /api/admin/reviews/:id with status=rejected when Rejeter is clicked", async () => {
    const updatedReview = { ...PENDING_REVIEW, status: "rejected" };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, opts?: RequestInit) => {
        if (opts?.method === "PATCH") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({ review: updatedReview, reviews: [updatedReview], pendingCount: 0 }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ reviews: [PENDING_REVIEW], pendingCount: 1 }),
        } as Response);
      }),
    );

    const { findByTestId } = render(AdminAvisTab);
    const rejectBtn = await findByTestId("btn-rejeter");
    await fireEvent.click(rejectBtn);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const patchCall = calls.find(
        ([_u, o]: [string, RequestInit]) => o?.method === "PATCH",
      );
      expect(patchCall).toBeTruthy();
      expect(JSON.parse(patchCall[1].body as string)).toEqual({ status: "rejected" });
    });
  });

  it("shows an error when the moderation PATCH fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, opts?: RequestInit) => {
        if (opts?.method === "PATCH") {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ error: "Avis introuvable" }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ reviews: [PENDING_REVIEW], pendingCount: 1 }),
        } as Response);
      }),
    );

    const { findByTestId } = render(AdminAvisTab);
    const approveBtn = await findByTestId("btn-approuver");
    await fireEvent.click(approveBtn);

    const banner = await findByTestId("avis-error");
    expect(banner.textContent).toContain("Avis introuvable");
  });
});

// ── Filter switching ─────────────────────────────────────────────────────────

describe("AdminAvisTab — filter switching", () => {
  it("marks the pending filter as active by default", async () => {
    const { getByTestId, findByTestId } = render(AdminAvisTab);
    await findByTestId("avis-loading");
    const pendingBtn = getByTestId("filter-pending");
    expect(pendingBtn.getAttribute("aria-pressed")).toBe("true");
    expect(pendingBtn.className).toContain("--active");
  });

  it("switches filter to approved on click and re-fetches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ reviews: [], pendingCount: 0 }),
        } as Response),
      ),
    );
    const { getByTestId, findByTestId } = render(AdminAvisTab);
    await findByTestId("avis-empty");

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const callsBefore = fetchMock.mock.calls.length;

    await fireEvent.click(getByTestId("filter-approved"));

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    const lastCall = fetchMock.mock.calls.at(-1);
    expect(lastCall[0]).toContain("status=approved");
    expect(getByTestId("filter-approved").getAttribute("aria-pressed")).toBe("true");
  });
});
