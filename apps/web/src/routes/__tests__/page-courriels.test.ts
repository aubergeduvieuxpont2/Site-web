import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/svelte";
import type { User, ApiError, EmailTemplateSummary, EmailPreview } from "$lib/api";

// ---------------------------------------------------------------------------
// Mock the typed API client. The courriels page reaches the network only
// through these helpers — never a raw fetch — so mocking the module fully
// isolates the component. `isError` keeps its real semantics so the page's
// success/error branching is exercised faithfully. The child components
// (EmailControlsBar / EmailPreviewPane) are NOT mocked — the test drives the
// real integration end to end.
// ---------------------------------------------------------------------------
const getMe = vi.fn();
const adminEmailTemplates = vi.fn();
const adminEmailPreview = vi.fn();

vi.mock("$lib/api", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  adminEmailTemplates: (...a: unknown[]) => adminEmailTemplates(...a),
  adminEmailPreview: (...a: unknown[]) => adminEmailPreview(...a),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" && r !== null && "error" in r && typeof (r as ApiError).error === "string",
}));

// Import AFTER the mock is registered so the component binds to the mock.
import Page from "../admin/courriels/+page.svelte";

const ADMIN: User = { id: 1, email: "admin@example.com", name: "Admin", role: "admin" };
const GUEST: User = { id: 2, email: "guest@example.com", name: "Guest", role: "guest" };

function template(over: Partial<EmailTemplateSummary> = {}): EmailTemplateSummary {
  return {
    key: "welcome",
    name: { fr: "Bienvenue", en: "Welcome" },
    subject: { fr: "Bienvenue à l'Auberge", en: "Welcome to the Inn" },
    ...over,
  };
}

function preview(over: Partial<EmailPreview> = {}): EmailPreview {
  return {
    subject: "Bienvenue à l'Auberge",
    html: "<html><body><h1>Bonjour Jean</h1></body></html>",
    text: "Bonjour Jean",
    ...over,
  };
}

beforeEach(() => {
  getMe.mockReset();
  adminEmailTemplates.mockReset();
  adminEmailPreview.mockReset();
  // Sensible defaults; individual tests override.
  getMe.mockResolvedValue({ user: ADMIN });
  adminEmailTemplates.mockResolvedValue({
    templates: [template(), template({ key: "password-reset", name: { fr: "Réinitialisation", en: "Password reset" } })],
  });
  adminEmailPreview.mockResolvedValue(preview());
});

afterEach(() => {
  cleanup();
});

describe("page-courriels auth gate", () => {
  it("shows a denied state (not a redirect) for a non-admin user", async () => {
    getMe.mockResolvedValue({ user: GUEST });
    const { findByTestId, queryByTestId } = render(Page);

    expect(await findByTestId("courriels-denied")).toBeTruthy();
    expect(await findByTestId("denied-msg")).toBeTruthy();
    // No template data is ever requested for a non-admin.
    expect(adminEmailTemplates).not.toHaveBeenCalled();
    expect(queryByTestId("courriels-main")).toBeNull();
  });

  it("shows the denied state when getMe returns an error (unauthenticated)", async () => {
    getMe.mockResolvedValue({ error: "Unauthorized" });
    const { findByTestId } = render(Page);
    expect(await findByTestId("courriels-denied")).toBeTruthy();
    expect(adminEmailTemplates).not.toHaveBeenCalled();
  });
});

describe("page-courriels admin flow", () => {
  it("mounts the main content and loads the template list for an admin", async () => {
    const { findByTestId } = render(Page);
    expect(await findByTestId("courriels-main")).toBeTruthy();
    await waitFor(() => expect(adminEmailTemplates).toHaveBeenCalledTimes(1));
    expect(await findByTestId("template-picker")).toBeTruthy();
    expect(await findByTestId("locale-toggle")).toBeTruthy();
    expect(await findByTestId("width-toggle")).toBeTruthy();
    expect(await findByTestId("back-link")).toBeTruthy();
  });

  it("fetches the first template's preview and mounts the sandboxed iframe with the preview HTML", async () => {
    const html = "<html><body><h1>Aperçu courriel</h1></body></html>";
    adminEmailPreview.mockResolvedValue(preview({ html }));
    const { findByTestId } = render(Page);

    // Preview is fetched for the first template in the default locale.
    await waitFor(() => expect(adminEmailPreview).toHaveBeenCalledWith("welcome", "fr"));

    const iframe = (await findByTestId("email-preview-iframe")) as HTMLIFrameElement;
    expect(iframe.tagName).toBe("IFRAME");
    // Sandboxed with no allow-* tokens — email HTML is fully isolated.
    expect(iframe.getAttribute("sandbox")).toBe("");
    expect(iframe.getAttribute("srcdoc")).toBe(html);

    const subject = await findByTestId("preview-subject");
    expect(subject.textContent).toContain("Bienvenue");
  });

  it("surfaces an error in the preview pane when the template list fails to load", async () => {
    adminEmailTemplates.mockResolvedValue({ error: "Erreur 500" });
    const { findByTestId } = render(Page);
    // Main still mounts (admin passed the gate); the error banner shows in the pane.
    expect(await findByTestId("courriels-main")).toBeTruthy();
    const banner = await findByTestId("email-preview-pane");
    await waitFor(() => expect(banner.textContent).toContain("Erreur 500"));
    // No preview request is made when there is no template to render.
    expect(adminEmailPreview).not.toHaveBeenCalled();
  });

  it("surfaces an error when the preview request itself fails", async () => {
    adminEmailPreview.mockResolvedValue({ error: "Champ manquant : firstName" });
    const { findByTestId } = render(Page);
    const pane = await findByTestId("email-preview-pane");
    await waitFor(() => expect(pane.textContent).toContain("Champ manquant"));
  });
});
