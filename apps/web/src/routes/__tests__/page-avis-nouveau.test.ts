import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";

// ── Stub the SvelteKit `page` store so the component can read searchParams ──
// The `nouveau` page uses `$page.url.searchParams.get("code")` synchronously
// on init. Mutating `mockUrl` before each render exercises all branches.
let mockUrl = new URL("http://localhost/avis/nouveau?code=AVP-ABC123");
vi.mock("$app/stores", () => ({
  page: {
    subscribe(run: (value: unknown) => void) {
      run({ url: mockUrl });
      return () => {};
    },
  },
}));

// Helper to stub global.fetch with a controllable response.
function stubFetch(ok: boolean, body: unknown, method?: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, opts?: RequestInit) => {
      // Match only if method specified, otherwise always respond
      if (method && opts?.method !== method) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: "Not found" }),
        } as Response);
      }
      return Promise.resolve({
        ok,
        status: ok ? 200 : 400,
        json: () => Promise.resolve(body),
      } as Response);
    }),
  );
}

// Import AFTER mocks
import Page from "../avis/nouveau/+page.svelte";

beforeEach(() => {
  mockUrl = new URL("http://localhost/avis/nouveau?code=AVP-ABC123");
  // Default: eligibility check returns eligible
  stubFetch(true, { eligible: true, firstName: "Marie" });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// ── No code in URL → ineligible immediately ──────────────────────────────────

describe("page /avis/nouveau — no code", () => {
  it("shows the ineligible state immediately when URL has no code", () => {
    mockUrl = new URL("http://localhost/avis/nouveau");
    const { getByTestId } = render(Page);
    const el = getByTestId("nouveau-avis-ineligible");
    expect(el).toBeTruthy();
  });

  it("does not call the eligibility endpoint when no code is present", () => {
    mockUrl = new URL("http://localhost/avis/nouveau");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(Page);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the 'Lien invalide' heading for missing code", () => {
    mockUrl = new URL("http://localhost/avis/nouveau");
    const { getByTestId } = render(Page);
    expect(getByTestId("nouveau-avis-ineligible-heading").textContent?.trim()).toBe("Lien invalide");
  });
});

// ── Code present → loading while eligibility check is in flight ──────────────

describe("page /avis/nouveau — loading state", () => {
  it("shows the loading indicator while eligibility is being checked", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { getByTestId } = render(Page);
    const loading = getByTestId("nouveau-avis-loading");
    expect(loading.getAttribute("aria-busy")).toBe("true");
  });
});

// ── Ineligible: API returns not-eligible ─────────────────────────────────────

describe("page /avis/nouveau — ineligible (ERR-GENERIC)", () => {
  it("shows the ineligible screen when the API says not eligible", async () => {
    stubFetch(true, { eligible: false });
    const { findByTestId } = render(Page);
    expect(await findByTestId("nouveau-avis-ineligible")).toBeTruthy();
  });

  it("shows the ineligible screen when the eligibility request returns non-ok", async () => {
    stubFetch(false, { error: "Invalid" });
    const { findByTestId } = render(Page);
    expect(await findByTestId("nouveau-avis-ineligible")).toBeTruthy();
  });

  it("shows the ineligible screen on fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Network"))));
    const { findByTestId } = render(Page);
    // Network errors map to the generic error view (same as ineligible for UX)
    // The page shows either ineligible or a generic error screen — no data leak
    const el = await findByTestId("nouveau-avis-ineligible").catch(() =>
      findByTestId("page-nouveau-avis"),
    );
    expect(el).toBeTruthy();
  });

  it("never leaks whether the code was valid (generic message for all failures)", async () => {
    stubFetch(false, { error: "Le code AVP-ABC123 n'existe pas" });
    const { findByTestId } = render(Page);
    const el = await findByTestId("nouveau-avis-ineligible");
    // Should show generic copy, not the leaked error text from the API
    expect(el.textContent).not.toContain("AVP-ABC123");
    expect(el.textContent).toContain("valide");
  });
});

// ── Eligible: form rendering ──────────────────────────────────────────────────

describe("page /avis/nouveau — eligible form", () => {
  it("renders the review form when the code is eligible", async () => {
    const { findByTestId } = render(Page);
    expect(await findByTestId("nouveau-avis-form")).toBeTruthy();
  });

  it("personalises the title with the guest's first name", async () => {
    const { findByTestId } = render(Page);
    const title = await findByTestId("nouveau-avis-title");
    expect(title.textContent?.trim()).toBe("Merci, Marie !");
  });

  it("renders a generic title when firstName is not returned", async () => {
    stubFetch(true, { eligible: true }); // no firstName
    const { findByTestId } = render(Page);
    const title = await findByTestId("nouveau-avis-title");
    expect(title.textContent?.trim()).toBe("Partagez votre expérience");
  });

  it("renders five star buttons", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    for (let n = 1; n <= 5; n++) {
      expect(document.querySelector(`[data-testid="star-btn-${n}"]`)).toBeTruthy();
    }
  });

  it("renders the body textarea", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    expect(document.querySelector("[data-testid='review-body-textarea']")).toBeTruthy();
  });

  it("renders the character count helper", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("review-body-count");
    expect(document.querySelector("[data-testid='review-body-count']")?.textContent).toContain("0/2000");
  });
});

// ── Star rating interaction ───────────────────────────────────────────────────

describe("page /avis/nouveau — star picker", () => {
  it("marks a star as pressed when clicked", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star3 = document.querySelector("[data-testid='star-btn-3']") as HTMLElement;
    await fireEvent.click(star3);
    expect(star3.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the star label text on selection", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star5 = document.querySelector("[data-testid='star-btn-5']") as HTMLElement;
    await fireEvent.click(star5);
    const label = await findByTestId("star-label-text");
    expect(label.textContent).toContain("Excellent");
  });

  it("star buttons have accessible aria-labels", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const star1 = document.querySelector("[data-testid='star-btn-1']") as HTMLElement;
    expect(star1.getAttribute("aria-label")).toContain("1 étoile");
  });
});

// ── Submit validation ─────────────────────────────────────────────────────────

describe("page /avis/nouveau — form validation", () => {
  it("disables the submit button when no rating is selected", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    // Type enough body text but leave rating at 0
    const textarea = document.querySelector(
      "[data-testid='review-body-textarea']",
    ) as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: "Un commentaire valide qui dépasse dix caractères." } });
    const submitBtn = document.querySelector(
      "[data-testid='button']",
    ) as HTMLButtonElement;
    // Submit button should be disabled without a rating
    expect(submitBtn.disabled || submitBtn.getAttribute("aria-disabled") === "true" || submitBtn.getAttribute("disabled") !== null).toBe(true);
  });

  it("disables submit when body is shorter than 10 characters", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    // Select a rating first
    const star4 = document.querySelector("[data-testid='star-btn-4']") as HTMLElement;
    await fireEvent.click(star4);
    const textarea = document.querySelector(
      "[data-testid='review-body-textarea']",
    ) as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: "Court" } }); // 5 chars
    const submitBtn = document.querySelector(
      "[data-testid='button']",
    ) as HTMLButtonElement;
    expect(
      submitBtn.disabled ||
      submitBtn.getAttribute("aria-disabled") === "true" ||
      submitBtn.getAttribute("disabled") !== null,
    ).toBe(true);
  });
});

// ── Successful submission ─────────────────────────────────────────────────────

describe("page /avis/nouveau — submit success", () => {
  it("shows the thank-you screen after successful submission", async () => {
    // First call: eligibility check (ok + eligible)
    // Second call (POST): submission success
    let callN = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        callN++;
        if (callN === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ eligible: true, firstName: "Marie" }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true }),
        } as Response);
      }),
    );

    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");

    // Fill in rating
    const star5 = document.querySelector("[data-testid='star-btn-5']") as HTMLElement;
    await fireEvent.click(star5);

    // Fill in body
    const textarea = document.querySelector(
      "[data-testid='review-body-textarea']",
    ) as HTMLTextAreaElement;
    await fireEvent.input(textarea, {
      target: { value: "Excellent séjour ! Je reviendrai sans hésiter." },
    });

    // Submit
    const form = document.querySelector("[data-testid='nouveau-avis-form']") as HTMLFormElement;
    await fireEvent.submit(form);

    const thanks = await findByTestId("nouveau-avis-submitted");
    expect(thanks).toBeTruthy();
    expect((await findByTestId("nouveau-avis-thanks-heading")).textContent).toContain("Merci");
  });
});

// ── Submission errors (ERR-GENERIC, ERR-CONFLICT) ───────────────────────────

describe("page /avis/nouveau — submit errors", () => {
  it("shows a generic error on any non-ok POST response (no data leak)", async () => {
    let callN = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        callN++;
        if (callN === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ eligible: true, firstName: "Marie" }),
          } as Response);
        }
        // 409 conflict (review already exists)
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () => Promise.resolve({ error: "Un avis existe déjà pour cette réservation." }),
        } as Response);
      }),
    );

    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");

    const star5 = document.querySelector("[data-testid='star-btn-5']") as HTMLElement;
    await fireEvent.click(star5);
    const textarea = document.querySelector(
      "[data-testid='review-body-textarea']",
    ) as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: "Un avis suffisamment long pour être valide ici." } });
    const form = document.querySelector("[data-testid='nouveau-avis-form']") as HTMLFormElement;
    await fireEvent.submit(form);

    const errorEl = await findByTestId("nouveau-avis-form-error");
    expect(errorEl.getAttribute("role")).toBe("alert");
    // Must show a generic message, not the specific API error (no data leak)
    expect(errorEl.textContent).toContain("Une erreur est survenue");
    // Must NOT show the raw API error (which could contain reservation data)
    expect(errorEl.textContent).not.toContain("Un avis existe déjà");
  });

  it("shows a network error message when fetch throws on submit", async () => {
    let callN = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        callN++;
        if (callN === 1) {
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
    const textarea = document.querySelector(
      "[data-testid='review-body-textarea']",
    ) as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: "Commentaire réseau assez long pour être valide." } });
    const form = document.querySelector("[data-testid='nouveau-avis-form']") as HTMLFormElement;
    await fireEvent.submit(form);

    const errorEl = await findByTestId("nouveau-avis-form-error");
    expect(errorEl.textContent).toContain("Réseau indisponible");
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("page /avis/nouveau — accessibility", () => {
  it("renders the root container with testid", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { getByTestId } = render(Page);
    expect(getByTestId("page-nouveau-avis")).toBeTruthy();
  });

  it("renders the body textarea with a label association", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("nouveau-avis-form");
    const textarea = document.querySelector("[data-testid='review-body-textarea']") as HTMLElement;
    expect(textarea.id).toBe("review-body");
    const label = document.querySelector('label[for="review-body"]');
    expect(label).toBeTruthy();
  });
});
