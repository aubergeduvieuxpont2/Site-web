// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readStatic(name: string): string {
  const path = fileURLToPath(new URL(`../../../static/${name}`, import.meta.url));
  return readFileSync(path, "utf8");
}

describe("robots.txt", () => {
  const robots = readStatic("robots.txt");

  it("allows crawling and points at the sitemap", () => {
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain(
      "Sitemap: https://www.aubergeduvieuxpont.ca/sitemap.xml",
    );
  });

  it("keeps private/admin areas out of the index", () => {
    for (const p of ["/admin", "/profil", "/connexion", "/api/"]) {
      expect(robots).toContain(`Disallow: ${p}`);
    }
  });
});

describe("sitemap.xml", () => {
  const sitemap = readStatic("sitemap.xml");

  it("is a valid urlset listing the public routes", () => {
    expect(sitemap).toContain("<urlset");
    for (const path of ["/", "/le-site", "/a-propos", "/contact", "/politiques", "/confidentialite"]) {
      const loc =
        path === "/"
          ? "https://www.aubergeduvieuxpont.ca/"
          : `https://www.aubergeduvieuxpont.ca${path}`;
      expect(sitemap).toContain(`<loc>${loc}</loc>`);
    }
  });

  it("does not expose private routes", () => {
    for (const p of ["/admin", "/profil", "/connexion", "/reinitialisation"]) {
      expect(sitemap).not.toContain(`<loc>https://www.aubergeduvieuxpont.ca${p}</loc>`);
    }
  });
});

describe("llms.txt", () => {
  const llms = readStatic("llms.txt");

  it("leads with the business name and a summary", () => {
    expect(llms).toContain("# L'Auberge du Vieux Pont");
    expect(llms).toContain("> ");
  });

  it("carries the core NAP facts for answer engines", () => {
    expect(llms).toContain("111, avenue Saint-Michel");
    expect(llms).toContain("418 655-1212");
    expect(llms).toContain("info@aubergeduvieuxpont.ca");
    expect(llms).toContain("304542");
  });
});
