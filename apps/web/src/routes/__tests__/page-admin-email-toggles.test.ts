import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Email toggle markup moved into AdminParametresTab; assert against the component.
const componentFile = path.resolve(
  __dirname,
  "../../lib/components/admin/AdminParametresTab.svelte",
);
const apiFile = path.resolve(__dirname, "../../lib/api.ts");
const read = (f: string) => fs.readFileSync(f, "utf-8");

describe("Admin Settings Page — automated email toggles", () => {
  it("renders the 'Courriels automatiques' sub-section heading", () => {
    expect(read(componentFile)).toContain("Courriels automatiques");
  });

  it("renders all four email toggle checkboxes with unique testids", () => {
    const content = read(componentFile);
    expect(content).toContain('data-testid="toggle-email-confirmation"');
    expect(content).toContain('data-testid="toggle-email-password-reset"');
    expect(content).toContain('data-testid="toggle-email-room-assignment"');
    expect(content).toContain('data-testid="toggle-email-welcome"');
  });

  it("binds each toggle to its settings field", () => {
    const content = read(componentFile);
    // Component uses local `s` state object (not `settings`).
    expect(content).toContain("bind:checked={s.emailConfirmationEnabled}");
    expect(content).toContain("bind:checked={s.emailPasswordResetEnabled}");
    expect(content).toContain("bind:checked={s.emailRoomAssignmentEnabled}");
    expect(content).toContain("bind:checked={s.emailWelcomeEnabled}");
  });

  it("gives each toggle an aria-label and an associated visible label", () => {
    const content = read(componentFile);
    expect(content).toContain('aria-label="Envoyer une confirmation de réservation par courriel"');
    expect(content).toContain('for="pt-email-confirmation"');
    expect(content).toContain('for="pt-email-welcome"');
  });

  it("reuses the existing toggle markup classes (no new styles)", () => {
    const content = read(componentFile);
    // At least five toggle rows: reservations-enabled + four email toggles.
    const wraps = content.match(/params-tab__toggle-row/g) ?? [];
    expect(wraps.length).toBeGreaterThanOrEqual(5);
  });

  it("seeds all four email toggles to false in settings state", () => {
    const content = read(componentFile);
    expect(content).toContain("emailConfirmationEnabled: false");
    expect(content).toContain("emailPasswordResetEnabled: false");
    expect(content).toContain("emailRoomAssignmentEnabled: false");
    expect(content).toContain("emailWelcomeEnabled: false");
  });
});

describe("api.ts — AdminSettings email toggle fields", () => {
  it("declares the four boolean email toggle fields on AdminSettings", () => {
    const content = read(apiFile);
    expect(content).toContain("emailConfirmationEnabled: boolean;");
    expect(content).toContain("emailPasswordResetEnabled: boolean;");
    expect(content).toContain("emailRoomAssignmentEnabled: boolean;");
    expect(content).toContain("emailWelcomeEnabled: boolean;");
  });

  it("does NOT add the email toggle keys to PublicSettings", () => {
    const content = read(apiFile);
    const publicBlock = content.slice(
      content.indexOf("export interface PublicSettings"),
      content.indexOf("export interface AdminSettings"),
    );
    expect(publicBlock).not.toContain("emailConfirmationEnabled");
    expect(publicBlock).not.toContain("emailWelcomeEnabled");
  });
});
