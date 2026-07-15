import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Admin Settings Page", () => {
  it("renders settings tab button with correct testid", () => {
    const pageFile = path.resolve(__dirname, "../admin/+page.svelte");
    const content = fs.readFileSync(pageFile, "utf-8");

    expect(content).toContain('data-testid="tab-settings"');
    expect(content).toContain('id="tab-settings"');
    expect(content).toContain('aria-controls="panel-settings"');
  });

  it("renders settings panel with correct testid", () => {
    const pageFile = path.resolve(__dirname, "../admin/+page.svelte");
    const content = fs.readFileSync(pageFile, "utf-8");

    expect(content).toContain('data-testid="panel-settings"');
    expect(content).toContain('id="panel-settings"');
    expect(content).toContain('aria-labelledby="tab-settings"');
  });

  it("renders all four input fields with correct testids", () => {
    const pageFile = path.resolve(__dirname, "../admin/+page.svelte");
    const content = fs.readFileSync(pageFile, "utf-8");

    expect(content).toContain('data-testid="input-nightly-price"');
    expect(content).toContain('data-testid="input-contact-email"');
    expect(content).toContain('data-testid="input-marketing-rooms"');
    expect(content).toContain('data-testid="input-assignable-rooms"');
  });

  it("renders save button with correct testid", () => {
    const pageFile = path.resolve(__dirname, "../admin/+page.svelte");
    const content = fs.readFileSync(pageFile, "utf-8");

    expect(content).toContain('data-testid="settings-save-btn"');
  });

  it("renders input fields with correct types", () => {
    const pageFile = path.resolve(__dirname, "../admin/+page.svelte");
    const content = fs.readFileSync(pageFile, "utf-8");

    // Nightly price should be number
    expect(content).toContain('id="input-nightly-price"');
    expect(content).toContain('type="number"');

    // Contact email should be email
    expect(content).toContain('id="input-contact-email"');
    expect(content).toContain('type="email"');
  });

  it("contains label for each input", () => {
    const pageFile = path.resolve(__dirname, "../admin/+page.svelte");
    const content = fs.readFileSync(pageFile, "utf-8");

    expect(content).toContain("Prix par nuit");
    expect(content).toContain("Courriel de contact");
    expect(content).toContain("Chambres affichées");
    expect(content).toContain("Capacité assignable");
  });
});
