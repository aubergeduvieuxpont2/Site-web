import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const pageFile = path.resolve(__dirname, "../admin/+page.svelte");
const componentFile = path.resolve(
  __dirname,
  "../../lib/components/admin/AdminParametresTab.svelte",
);

const readPage = () => fs.readFileSync(pageFile, "utf-8");
const readComponent = () => fs.readFileSync(componentFile, "utf-8");

describe("Admin Settings Page — tab and panel structure", () => {
  it("renders settings tab button with correct testid", () => {
    const content = readPage();
    expect(content).toContain('data-testid="tab-settings"');
    expect(content).toContain('id="tab-settings"');
    expect(content).toContain('aria-controls="panel-settings"');
  });

  it("renders settings panel with correct testid", () => {
    const content = readPage();
    expect(content).toContain('data-testid="panel-settings"');
    expect(content).toContain('id="panel-settings"');
    expect(content).toContain('aria-labelledby="tab-settings"');
  });

  it("renders AdminParametresTab inside the settings panel", () => {
    // All settings UI is delegated to AdminParametresTab; the page owns only
    // the tab/panel shell and the assignableRoomCount binding.
    const content = readPage();
    expect(content).toContain("AdminParametresTab");
  });
});

describe("AdminParametresTab component — settings fields", () => {
  it("keeps the two general-settings fields (price + email)", () => {
    const content = readComponent();
    expect(content).toContain('data-testid="input-nightly-price"');
    expect(content).toContain('data-testid="input-contact-email"');
  });

  it("removes the marketing room-count field and shows assignable as a read-only derived value", () => {
    const content = readComponent();
    // The marketing/display room count stays removed — the public count is derived
    // from the Rooms tab, not a manual field.
    expect(content).not.toContain('data-testid="input-marketing-rooms"');
    expect(content).not.toContain("Chambres affichées");
    // marketingRoomCount must not appear anywhere in the component state or defaults.
    expect(content).not.toContain("marketingRoomCount");
    // Assignable room count is shown but read-only: it equals the number of public
    // rooms and is recomputed server-side, never authored here.
    expect(content).toContain('data-testid="input-assignable-rooms"');
    expect(content).toContain("readonly");
  });

  it("renders save button with correct testid", () => {
    expect(readComponent()).toContain('data-testid="settings-save-btn"');
  });

  it("renders input fields with correct types", () => {
    const content = readComponent();
    expect(content).toContain('data-testid="input-nightly-price"');
    expect(content).toContain('type="number"');
    expect(content).toContain('data-testid="input-contact-email"');
    expect(content).toContain('type="email"');
  });

  it("labels the two retained general fields", () => {
    const content = readComponent();
    expect(content).toContain("Prix par nuit");
    expect(content).toContain("Courriel de contact");
  });

  it("has responsive CSS to prevent horizontal overflow at narrow mobile widths", () => {
    const content = readComponent();
    // Inputs are constrained to max-width: 100% so no input can exceed the
    // viewport width. A 640px breakpoint forces inputs to full width, ensuring
    // no horizontal scrollbar appears at viewport widths down to 375px.
    expect(content).toContain("max-width: 100%");
    expect(content).toContain("max-width: 640px");
  });
});

describe("AdminParametresTab component — change-password sub-section", () => {
  it("renders both password fields with correct testids and types", () => {
    const content = readComponent();
    expect(content).toContain('data-testid="input-current-password"');
    expect(content).toContain('data-testid="input-new-password"');
    // Both password inputs use type="password"
    expect(content).toContain('type="password"');
  });

  it("wires the correct autocomplete hints on the password fields", () => {
    const content = readComponent();
    expect(content).toContain('autocomplete="current-password"');
    expect(content).toContain('autocomplete="new-password"');
  });

  it("renders the password submit button", () => {
    expect(readComponent()).toContain('data-testid="pw-change-btn"');
  });

  it("has error and success live regions for password change", () => {
    const content = readComponent();
    expect(content).toContain('data-testid="pw-error"');
    expect(content).toContain('data-testid="pw-success"');
  });

  it("calls the changePassword client through a dedicated handler", () => {
    const content = readComponent();
    expect(content).toContain("changePassword");
    expect(content).toContain("changePasswordInPanel");
  });

  it("enforces the 8-character minimum on the new password client-side", () => {
    const content = readComponent();
    expect(content).toContain("pwNew.length < 8");
  });

  it("headings label both sub-sections for assistive tech", () => {
    const content = readComponent();
    // Settings cards are each labeled by a section heading via aria-labelledby.
    // The security/password section uses the id="card-securite" heading.
    expect(content).toContain("aria-labelledby");
    expect(content).toContain('id="card-securite"');
    // The security section heading is "Sécurité".
    expect(content).toContain("Sécurité");
  });
});

describe("AdminParametresTab component — load and save state markers", () => {
  it("has a load-error banner with testid='params-error' for ERR-LOAD-FAILED", () => {
    // When adminGetSettings returns an error the component renders this element
    // with role='alert' so screen readers announce the failure immediately.
    expect(readComponent()).toContain('data-testid="params-error"');
  });

  it("has a save-error span with testid='params-save-error' for ERR-SAVE-FAILED", () => {
    // When adminUpdateSettings rejects the payload this element appears inside
    // the sticky save bar so the error is adjacent to the save button.
    expect(readComponent()).toContain('data-testid="params-save-error"');
  });

  it("has a saved-success span with testid='settings-saved' and role='status' for the happy path", () => {
    const content = readComponent();
    // Polite live region: role='status' announces the confirmation without
    // interrupting the user.
    expect(content).toContain('data-testid="settings-saved"');
    expect(content).toContain('role="status"');
  });

  it("has a clearly-marked post-save seam comment for the config-refresh stream", () => {
    // The follow-on config-refresh stream will insert a public-settings store
    // refresh at this location without touching any other logic here.
    expect(readComponent()).toContain("POST-SAVE SEAM");
  });
});

describe("AdminParametresTab component — all functional fields and toggles", () => {
  it("renders the weekly price field", () => {
    expect(readComponent()).toContain('data-testid="input-weekly-price"');
  });

  it("renders the contact phone field", () => {
    expect(readComponent()).toContain('data-testid="input-contact-phone"');
  });

  it("renders all three tax-rate fields", () => {
    const content = readComponent();
    expect(content).toContain('data-testid="tps-input"');
    expect(content).toContain('data-testid="tvq-input"');
    expect(content).toContain('data-testid="accommodation-tax-input"');
  });

  it("renders the reservations-enabled toggle", () => {
    expect(readComponent()).toContain('data-testid="toggle-reservations-enabled"');
  });

  it("renders all five automatic email toggles including the review-request one", () => {
    const content = readComponent();
    expect(content).toContain('data-testid="toggle-email-confirmation"');
    expect(content).toContain('data-testid="toggle-email-password-reset"');
    expect(content).toContain('data-testid="toggle-email-room-assignment"');
    expect(content).toContain('data-testid="toggle-email-welcome"');
    // The fifth toggle was added in the settings redesign; it must not be dropped.
    expect(content).toContain('data-testid="toggle-email-review-request"');
  });

  it("renders section headings for all five card groups via aria-labelledby", () => {
    const content = readComponent();
    // Each card section uses aria-labelledby pointing at its heading id.
    expect(content).toContain('id="card-tarification"');
    expect(content).toContain('id="card-coordonnees"');
    expect(content).toContain('id="card-reservations"');
    expect(content).toContain('id="card-emails"');
    expect(content).toContain('id="card-securite"');
  });
});
