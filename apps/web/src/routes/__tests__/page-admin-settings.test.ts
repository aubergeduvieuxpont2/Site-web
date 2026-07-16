import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const pageFile = path.resolve(__dirname, "../admin/+page.svelte");
const read = () => fs.readFileSync(pageFile, "utf-8");

describe("Admin Settings Page — Paramètres tab", () => {
  it("renders settings tab button with correct testid", () => {
    const content = read();
    expect(content).toContain('data-testid="tab-settings"');
    expect(content).toContain('id="tab-settings"');
    expect(content).toContain('aria-controls="panel-settings"');
  });

  it("renders settings panel with correct testid", () => {
    const content = read();
    expect(content).toContain('data-testid="panel-settings"');
    expect(content).toContain('id="panel-settings"');
    expect(content).toContain('aria-labelledby="tab-settings"');
  });

  it("keeps the two general-settings fields (price + email)", () => {
    const content = read();
    expect(content).toContain('data-testid="input-nightly-price"');
    expect(content).toContain('data-testid="input-contact-email"');
  });

  it("removes the marketing/assignable room-count fields", () => {
    const content = read();
    expect(content).not.toContain('data-testid="input-marketing-rooms"');
    expect(content).not.toContain('data-testid="input-assignable-rooms"');
    expect(content).not.toContain("Chambres affichées");
    expect(content).not.toContain("Capacité assignable");
  });

  it("renders save button with correct testid", () => {
    expect(read()).toContain('data-testid="settings-save-btn"');
  });

  it("renders input fields with correct types", () => {
    const content = read();
    expect(content).toContain('id="input-nightly-price"');
    expect(content).toContain('type="number"');
    expect(content).toContain('id="input-contact-email"');
    expect(content).toContain('type="email"');
  });

  it("labels the two retained general fields", () => {
    const content = read();
    expect(content).toContain("Prix par nuit");
    expect(content).toContain("Courriel de contact");
  });
});

describe("Admin Settings Page — change-password sub-section", () => {
  it("renders both password fields with correct testids and types", () => {
    const content = read();
    expect(content).toContain('data-testid="input-current-password"');
    expect(content).toContain('data-testid="input-new-password"');
    // Both password inputs use type="password"
    expect(content).toContain('type="password"');
  });

  it("wires the correct autocomplete hints on the password fields", () => {
    const content = read();
    expect(content).toContain('autocomplete="current-password"');
    expect(content).toContain('autocomplete="new-password"');
  });

  it("renders the password submit button", () => {
    expect(read()).toContain('data-testid="pw-change-btn"');
  });

  it("has error and success live regions for password change", () => {
    const content = read();
    expect(content).toContain('data-testid="pw-error"');
    expect(content).toContain('data-testid="pw-success"');
  });

  it("calls the changePassword client through a dedicated handler", () => {
    const content = read();
    expect(content).toContain("changePassword");
    expect(content).toContain("changePasswordInPanel");
  });

  it("enforces the 8-character minimum on the new password client-side", () => {
    const content = read();
    expect(content).toContain("pwNew.length < 8");
  });

  it("headings label both sub-sections for assistive tech", () => {
    const content = read();
    expect(content).toContain('id="settings-heading"');
    expect(content).toContain('id="pw-heading"');
    expect(content).toContain("Changer le mot de passe");
  });
});
