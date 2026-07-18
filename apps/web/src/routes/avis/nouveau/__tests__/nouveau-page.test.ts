/**
 * Conformance tests for /avis/nouveau (+page.svelte).
 *
 * SDD-IR scope: OP-Reviews.eligibility, OP-Reviews.submit,
 * INV-masked-identity, ERR-BADREQUEST, ERR-CONFLICT.
 *
 * Design spec §6d: public submission page
 * - GET /api/reviews/eligibility?code=… → { eligible, firstName? }
 * - POST /api/reviews → { ok: true } (201) on success, 409 on repeat
 * - Generic responses for invalid/ineligible codes (no reservation data leak)
 * - Works without login (public, rate-limited)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";

// ── Mock $app/stores so the component can read searchParams synchronously ──────
// The page derives `code` from `$page.url.searchParams.get("code")` on init.
let mockUrl = new URL("http://localhost/avis/nouveau?code=AVP-ABC123");
vi.mock("$app/stores", () => ({
  page: {
    subscribe(run: (value: unknown) => void) {
      run({ url: mockUrl });
      return () => {};
    },
  },
}));

// ── Fetch stub helpers ────────────────────────────────────────────────────────

function stubEligible(firstName?: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(firstName ? { eligible: true, firstName } : { eligible: true }),
      } as Response),
    ),
  );
}

function stubIneligible() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ eligible: false }),
      } as Response),
    ),
  );
}

/**
 * Two-phase stub: call 1 = eligibility check (ok, eligible), call N = submit response.
 */
function stubEligibleThenSubmit(submitOk: boolean, submitBody: unknown, submitStatus = 200) {
  let callCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ eligible: true, firstName: "Marie" }),
        } as Response);
      }
      return Promise.resolve({
        ok: submitOk,
        status: submitStatus,
        json: () => Promise.resolve(submitBody),
      } as Response);
    }),
  );
}

// Import AFTER mocks (static imports are hoisted but vi.mock() is hoisted first).
import Page from "../+page.svelte";

beforeEach(() => {
  mockUrl = new URL("http://localhost/avis/nouveau?code=AVP-ABC123");
  stubEligible("Marie");
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// ── No code in URL — ineligible immediately (no fetch) ──────────────────────

describe("/avis/nouveau — no code (OP-Reviews.eligibility: ERR-BADREQUEST)", () => {
  it("renders the ineligible screen immediately when URL has no code param", () => {
    mockUrl = new URL("http://localhost/avis/nouveau");
    const { getByTestId } = render(Page);
    expect(getByTestId("nouveau-avis-ineligible")).toBeTruthy();
  });

  it("does NOT call the eligibility endpoint when no code is present", () => {
    mockUrl = new URL("http://localhost/avis/nouveau");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(Page);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the 'Lien invalide' heading for a missing code", () => {
    mockUrl = new URL("http://localhost/avis/nouveau");
    const { getByTestId } = render(Page);
    expect(getByTestId("nouveau-avis-ineligible-heading").textContent?.trim()).toBe("Lien invalide");
  });
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe("/avis/nouveau — loading (OP-Reviews.eligibility in flight)", () => {
  it("shows aria-busy='true' loading indicator while eligibility check is in flight", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { getByTestId } = render(Page);
    const loader = getByTestId("nouveau-avis-loading");
    expect(loader.getAttribute("aria-busy")).toBe("true");
  });

  it("renders the root container (data-testid='page-nouveau-avis') even during load", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { getByTestId } = render(Page);
    expect(getByTestId("page-nouveau-avis")).toBeTruthy();
  });
});

// ── Eligibility check — endpoint and payload ──────────────────────────────────

describe("/avis/nouveau — eligibility endpoint (OP-Reviews.eligibility)", () => {
  it("calls GET /api/reviews/eligibility?code=… with the URL code param", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ eligible: true, firstName: "Marie" }),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/reviews/eligibility"),
      expect.objectContaining({ credentials: "include" }),
    );
    // The code must be URL-encoded in the query string
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("code=AVP-ABC123");
  });

  it("returns generic ineligible screen for any non-eligible code (no reservation data leak)", async () => {
    stubIneligible();
    const { findByTestId } = render(Page);
    const el = await findByTestId("nouveau-avis-ineligible");
    expect(el).toBeTruthy();
    // Must NOT expose any reservation details or reason
    expect(el.textContent).not.toContain("AVP-ABC123");
    expect(el.textContent).not.toContain("raison");
  });

  it("shows ineligible screen when API returns a non-ok error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: "Invalid" }) } as Response),
      ),
    );
    const { findByTestId } = render(Page);
    expect(await findByTestId("nouveau-avis-ineligible")).toBeTruthy();
  });

  it("shows generic screen on network failure — does not leak that the fetch failed", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Network"))));
    const { findByTestId } = render(Page);
    // Both 'error' and 'ineligible' viewstates render the same generic block
    expect(await findByTestId("nouveau-avis-ineligible")).toBeTruthy();
  });
});

// ── Eligible — form rendering ─────────────────────────────────────────────────

describe("/avis/nouveau — eligible form (OP-Reviews.eligibility: eligible=true)", () => {
  it("renders the review form when API returns eligible: true", async () => {
    const { findByTestId } = render(Page);
    expect(await findByTestId("nouveau-avis-form")).toBeTruthy();
  });

  it("personalises the title with the guest's firstName from the eligibility response", async () => {
    const { findByTestId } = render(Page);
    const title = await findByTestId("nouveau-avis-title");
    expect(title.textContent?.trim()).toBe("Merci, Marie !");
  });

  it("renders a generic title when the eligibility response includes no firstName", async () => {
    stubEligible(); // no firstName
    const { findByTestId } = render(Page);
    const title = await findByTestId("nouveau-avis-title");
    expect(title.textContent?.trim()).toBe("Partagez votre expérience");
  });

  it("renders five star buttons (rating 1–5, spec §6b)", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    for (let n = 1; n <= 5; n++) {
      expect(document.querySelector(`[data-testid="star-btn-${n}"]`)).toBeTruthy();
    }
  });

  it("renders the body textarea with a proper label association (accessibility)", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const textarea = document.querySelector("[data-testid='review-body-textarea']") as HTMLElement;
    expect(textarea.id).toBe("review-body");
    expect(document.querySelector('label[for="review-body"]')).toBeTruthy();
  });

  it("renders the character count helper (0/2000 initially)", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("review-body-count");
    expect(document.querySelector("[data-testid='review-body-count']")?.textContent).toContain("0/2000");
  });
});

// ── Star picker (rating 1–5, spec §6b) ───────────────────────────────────────

describe("/avis/nouveau — star picker", () => {
  it("marks a star as pressed (aria-pressed='true') when clicked", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star3 = document.querySelector("[data-testid='star-btn-3']") as HTMLElement;
    await fireEvent.click(star3);
    expect(star3.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the star label text (e.g. 'Excellent') when a star is selected", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star5 = document.querySelector("[data-testid='star-btn-5']") as HTMLElement;
    await fireEvent.click(star5);
    const label = await findByTestId("star-label-text");
    expect(label.textContent).toContain("Excellent");
  });

  it("star buttons have accessible aria-labels describing the rating", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star1 = document.querySelector("[data-testid='star-btn-1']") as HTMLElement;
    expect(star1.getAttribute("aria-label")).toContain("1 étoile");
  });
});

// ── Form validation (OP-Reviews.submit pre-conditions) ───────────────────────

describe("/avis/nouveau — form validation", () => {
  it("disables submit when no rating is selected (rating must be 1–5, spec §6b)", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const textarea = document.querySelector("[data-testid='review-body-textarea']") as HTMLTextAreaElement;
    // Type a valid body but leave rating at 0
    await fireEvent.input(textarea, { target: { value: "Un commentaire valide qui dépasse dix caractères." } });
    const btn = document.querySelector("[data-testid='button']") as HTMLButtonElement;
    const isDisabled = btn.disabled || btn.getAttribute("aria-disabled") === "true" || btn.getAttribute("disabled") !== null;
    expect(isDisabled).toBe(true);
  });

  it("disables submit when body is shorter than 10 characters (spec §6b: body 10–2000)", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star4 = document.querySelector("[data-testid='star-btn-4']") as HTMLElement;
    await fireEvent.click(star4);
    const textarea = document.querySelector("[data-testid='review-body-textarea']") as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: "Court" } }); // 5 chars
    const btn = document.querySelector("[data-testid='button']") as HTMLButtonElement;
    const isDisabled = btn.disabled || btn.getAttribute("aria-disabled") === "true" || btn.getAttribute("disabled") !== null;
    expect(isDisabled).toBe(true);
  });
});

// ── Successful submission (OP-Reviews.submit happy path) ─────────────────────

describe("/avis/nouveau — submit success", () => {
  it("shows the thank-you screen after a successful POST /api/reviews (201 ok)", async () => {
    stubEligibleThenSubmit(true, { ok: true }, 201);
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");

    // Fill in rating
    const star5 = document.querySelector("[data-testid='star-btn-5']") as HTMLElement;
    await fireEvent.click(star5);

    // Fill in body
    const textarea = document.querySelector("[data-testid='review-body-textarea']") as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: "Excellent séjour ! Je reviendrai sans hésiter." } });

    // Submit the form
    const form = document.querySelector("[data-testid='nouveau-avis-form']") as HTMLFormElement;
    await fireEvent.submit(form);

    const thanks = await findByTestId("nouveau-avis-submitted");
    expect(thanks).toBeTruthy();
  });

  it("shows 'Merci' heading in the thank-you screen", async () => {
    stubEligibleThenSubmit(true, { ok: true });
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star5 = document.querySelector("[data-testid='star-btn-5']") as HTMLElement;
    await fireEvent.click(star5);
    const textarea = document.querySelector("[data-testid='review-body-textarea']") as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: "Très belle expérience dans cet établissement charmant." } });
    const form = document.querySelector("[data-testid='nouveau-avis-form']") as HTMLFormElement;
    await fireEvent.submit(form);
    const heading = await findByTestId("nouveau-avis-thanks-heading");
    expect(heading.textContent).toContain("Merci");
  });

  it("sends POST to /api/reviews with code, rating, and body", async () => {
    let capturedRequest: { url: string; opts: RequestInit } | null = null;
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, opts?: RequestInit) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ eligible: true, firstName: "Marie" }),
          } as Response);
        }
        capturedRequest = { url, opts: opts ?? {} };
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true }),
        } as Response);
      }),
    );

    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star4 = document.querySelector("[data-testid='star-btn-4']") as HTMLElement;
    await fireEvent.click(star4);
    const textarea = document.querySelector("[data-testid='review-body-textarea']") as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: "Très agréable séjour. Personnel aux petits soins." } });
    const form = document.querySelector("[data-testid='nouveau-avis-form']") as HTMLFormElement;
    await fireEvent.submit(form);
    await findByTestId("nouveau-avis-submitted");

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.url).toContain("/api/reviews");
    expect(capturedRequest!.opts.method).toBe("POST");
    const sentBody = JSON.parse(capturedRequest!.opts.body as string);
    expect(sentBody.code).toBe("AVP-ABC123");
    expect(sentBody.rating).toBe(4);
    expect(typeof sentBody.body).toBe("string");
    expect(sentBody.body.length).toBeGreaterThanOrEqual(10);
  });
});

// ── ERR-CONFLICT (409) — INV-one-review-per-reservation ──────────────────────

describe("/avis/nouveau — ERR-CONFLICT (INV-one-review-per-reservation)", () => {
  it("shows a generic error on 409 response — does NOT expose conflict details (INV-masked-identity)", async () => {
    stubEligibleThenSubmit(
      false,
      { error: "Un avis existe déjà pour cette réservation." },
      409,
    );
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star5 = document.querySelector("[data-testid='star-btn-5']") as HTMLElement;
    await fireEvent.click(star5);
    const textarea = document.querySelector("[data-testid='review-body-textarea']") as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: "Un avis suffisamment long pour être valide ici." } });
    const form = document.querySelector("[data-testid='nouveau-avis-form']") as HTMLFormElement;
    await fireEvent.submit(form);

    const errorEl = await findByTestId("nouveau-avis-form-error");
    expect(errorEl.getAttribute("role")).toBe("alert");
    // Generic error message — must NOT echo back any server detail (data leak prevention)
    expect(errorEl.textContent).toContain("Une erreur est survenue");
    expect(errorEl.textContent).not.toContain("Un avis existe déjà");
    expect(errorEl.textContent).not.toContain("409");
  });
});

// ── ERR-BADREQUEST (400) — generic error handling ────────────────────────────

describe("/avis/nouveau — ERR-BADREQUEST (400) error handling", () => {
  it("shows a generic error on any non-ok POST response (no data leak)", async () => {
    stubEligibleThenSubmit(false, { error: "Corps invalide." }, 400);
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star3 = document.querySelector("[data-testid='star-btn-3']") as HTMLElement;
    await fireEvent.click(star3);
    const textarea = document.querySelector("[data-testid='review-body-textarea']") as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: "Séjour agréable dans l'ensemble, je recommande." } });
    const form = document.querySelector("[data-testid='nouveau-avis-form']") as HTMLFormElement;
    await fireEvent.submit(form);

    const errorEl = await findByTestId("nouveau-avis-form-error");
    expect(errorEl.textContent).toContain("Une erreur est survenue");
    expect(errorEl.textContent).not.toContain("Corps invalide");
  });
});

// ── Network failure on submit ─────────────────────────────────────────────────

describe("/avis/nouveau — network error on submit", () => {
  it("shows 'Réseau indisponible' when fetch throws during POST", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ eligible: true, firstName: "Marie" }),
          } as Response);
        }
        return Promise.reject(new Error("Network failure"));
      }),
    );

    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star4 = document.querySelector("[data-testid='star-btn-4']") as HTMLElement;
    await fireEvent.click(star4);
    const textarea = document.querySelector("[data-testid='review-body-textarea']") as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: "Commentaire réseau assez long pour être valide." } });
    const form = document.querySelector("[data-testid='nouveau-avis-form']") as HTMLFormElement;
    await fireEvent.submit(form);

    const errorEl = await findByTestId("nouveau-avis-form-error");
    expect(errorEl.textContent).toContain("Réseau indisponible");
  });
});

// ── INV-masked-identity — no data leak in any error message ──────────────────

describe("/avis/nouveau — INV-masked-identity", () => {
  it("ineligible screen never includes the reservation code or API error detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: "Code AVP-ABC123 invalide" }),
        } as Response),
      ),
    );
    const { findByTestId } = render(Page);
    const el = await findByTestId("nouveau-avis-ineligible");
    expect(el.textContent).not.toContain("AVP-ABC123");
    expect(el.textContent).not.toContain("Code AVP-ABC123 invalide");
    // Generic copy must mention validity without leaking data
    expect(el.textContent).toContain("valide");
  });

  it("form error never exposes raw API error text that could reveal reservation data", async () => {
    stubEligibleThenSubmit(
      false,
      { error: "Reservation ID 42 email marie@example.com already reviewed" },
      400,
    );
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star5 = document.querySelector("[data-testid='star-btn-5']") as HTMLElement;
    await fireEvent.click(star5);
    const textarea = document.querySelector("[data-testid='review-body-textarea']") as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: "Commentaire valide ayant plus de dix caractères." } });
    const form = document.querySelector("[data-testid='nouveau-avis-form']") as HTMLFormElement;
    await fireEvent.submit(form);

    const errorEl = await findByTestId("nouveau-avis-form-error");
    expect(errorEl.textContent).not.toContain("marie@example.com");
    expect(errorEl.textContent).not.toContain("Reservation ID");
    expect(errorEl.textContent).not.toContain("42");
  });
});
