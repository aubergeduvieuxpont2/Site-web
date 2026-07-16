// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  canonical,
  SITE_URL,
  OG_IMAGE,
  lodgingBusinessSchema,
  breadcrumbSchema,
  faqSchema,
} from "../seo";
import { SITE, FAQ } from "../content";

describe("canonical()", () => {
  it("maps the home path to the origin with a trailing slash", () => {
    expect(canonical("/")).toBe(`${SITE_URL}/`);
    expect(canonical("")).toBe(`${SITE_URL}/`);
  });

  it("prefixes the origin onto a route path", () => {
    expect(canonical("/le-site")).toBe(`${SITE_URL}/le-site`);
  });

  it("normalizes a path missing its leading slash", () => {
    expect(canonical("contact")).toBe(`${SITE_URL}/contact`);
  });

  it("uses the production https origin, not localhost", () => {
    expect(SITE_URL).toBe("https://www.aubergeduvieuxpont.ca");
    expect(OG_IMAGE.indexOf(`${SITE_URL}/img/`)).toBe(0);
  });
});

describe("lodgingBusinessSchema()", () => {
  const s = lodgingBusinessSchema();

  it("is a schema.org LodgingBusiness", () => {
    expect(s["@context"]).toBe("https://schema.org");
    expect(s["@type"]).toBe("LodgingBusiness");
  });

  it("carries the real postal address from SITE", () => {
    expect(s.address).toMatchObject({
      "@type": "PostalAddress",
      streetAddress: SITE.address.street,
      addressLocality: "Saint-Raymond",
      addressRegion: "QC",
      postalCode: SITE.address.postal,
      addressCountry: "CA",
    });
  });

  it("carries geo coordinates and an E.164 telephone", () => {
    expect(s.geo).toMatchObject({
      "@type": "GeoCoordinates",
      latitude: SITE.coords.lat,
      longitude: SITE.coords.lng,
    });
    expect(s.telephone).toBe("+14186551212");
  });

  it("exposes the CITQ registration as an identifier", () => {
    expect(s.identifier).toMatchObject({
      "@type": "PropertyValue",
      name: "CITQ",
      value: SITE.citq,
    });
  });

  it("lists every amenity as a feature", () => {
    expect(Array.isArray(s.amenityFeature)).toBe(true);
    expect((s.amenityFeature as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("breadcrumbSchema()", () => {
  const s = breadcrumbSchema([
    { name: "Accueil", path: "/" },
    { name: "Le site", path: "/le-site" },
  ]);

  it("is a BreadcrumbList with positioned, absolute items", () => {
    expect(s["@type"]).toBe("BreadcrumbList");
    const items = s.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ position: 1, name: "Accueil" });
    expect(items[1]).toMatchObject({
      position: 2,
      name: "Le site",
      item: `${SITE_URL}/le-site`,
    });
  });
});

describe("faqSchema()", () => {
  const s = faqSchema(FAQ);

  it("is a FAQPage mapping every question to an answer", () => {
    expect(s["@type"]).toBe("FAQPage");
    const entities = s.mainEntity as Array<Record<string, unknown>>;
    expect(entities).toHaveLength(FAQ.length);
    expect(entities[0]).toMatchObject({
      "@type": "Question",
      name: FAQ[0].question,
      acceptedAnswer: { "@type": "Answer", text: FAQ[0].answer },
    });
  });
});
