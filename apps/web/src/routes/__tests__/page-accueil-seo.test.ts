// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Page from "../+page.svelte";
import { FAQ } from "$lib/content";

function renderPage() {
  return render(Page, { props: {} });
}

describe("home page — FAQ section (AEO)", () => {
  it("renders a visible FAQ section", () => {
    const { body } = renderPage();
    expect(body).toContain('data-testid="faq-section"');
    expect(body).toContain('id="faq-heading"');
  });

  it("renders one visible item per FAQ entry, with the question text", () => {
    const { body } = renderPage();
    const items = body.match(/data-testid="faq-item"/g) ?? [];
    expect(items).toHaveLength(FAQ.length);
    expect(body).toContain(FAQ[0].question);
  });
});

describe("home page — structured data & meta", () => {
  it("emits LodgingBusiness and FAQPage JSON-LD in the head", () => {
    const { head } = renderPage();
    expect(head).toContain('<script type="application/ld+json">');
    expect(head).toContain('"@type":"LodgingBusiness"');
    expect(head).toContain('"@type":"FAQPage"');
  });

  it("emits a canonical URL and a unique description", () => {
    const { head } = renderPage();
    expect(head).toContain(
      'rel="canonical" href="https://www.aubergeduvieuxpont.ca/"',
    );
    expect(head).toContain('<meta name="description"');
  });
});
