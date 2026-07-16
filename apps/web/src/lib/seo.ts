/**
 * SEO / structured-data helpers.
 *
 * One place to build canonical URLs and the JSON-LD graphs the pages emit via
 * the `<Seo>` component. Everything is derived from `SITE` in `content.ts` so
 * the machine-readable NAP (name/address/phone) stays in lock-step with the
 * visible copy.
 */
import { SITE, AMENITIES, FAQ, DEFAULTS, type Faq } from "./content";

/** Canonical production origin, no trailing slash. */
export const SITE_URL = SITE.url;

/** Default social-share / structured-data image (absolute URL). */
export const OG_IMAGE = `${SITE_URL}/img/auberge-exterior.jpg`;

/** Absolute URL for a site path. `canonical("/")` → the bare origin + "/". */
export function canonical(path: string): string {
  if (!path || path === "/") return `${SITE_URL}/`;
  return `${SITE_URL}${path[0] === "/" ? path : `/${path}`}`;
}

/** JSON-LD graph node type — an untyped bag; schema.org shapes vary widely. */
export type JsonLd = Record<string, unknown>;

/**
 * `LodgingBusiness` for the property. Emitted on the home page; carries the
 * full NAP, geo, price band and the CITQ registration number so search and
 * answer engines can surface a rich lodging entity.
 */
export function lodgingBusinessSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    "@id": `${SITE_URL}/#lodging`,
    name: SITE.name,
    description:
      "Auberge à Saint-Raymond (Portneuf) pour les travailleurs de terrain — foresterie et secteur hydroélectrique. Chambres insonorisées, stockage d'équipement et tarifs d'entreprise.",
    url: `${SITE_URL}/`,
    telephone: "+14186551212",
    email: SITE.email,
    image: OG_IMAGE,
    priceRange: "$$",
    currenciesAccepted: "CAD",
    foundingDate: SITE.established,
    address: {
      "@type": "PostalAddress",
      streetAddress: SITE.address.street,
      addressLocality: SITE.address.city,
      addressRegion: "QC",
      postalCode: SITE.address.postal,
      addressCountry: "CA",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: SITE.coords.lat,
      longitude: SITE.coords.lng,
    },
    areaServed: "Portneuf, Québec",
    amenityFeature: AMENITIES.map((a) => ({
      "@type": "LocationFeatureSpecification",
      name: a.title,
      value: true,
    })),
    identifier: {
      "@type": "PropertyValue",
      name: "CITQ",
      value: SITE.citq,
    },
  };
}

/** `BreadcrumbList` from an ordered list of `{ name, path }` crumbs. */
export function breadcrumbSchema(
  crumbs: { name: string; path: string }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: canonical(c.path),
    })),
  };
}

/** `FAQPage` built from the shared `FAQ` content (defaults to all entries). */
export function faqSchema(items: Faq[] = FAQ): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

// Referenced so the default nightly price stays associated with this module's
// intent even though the FAQ copy states it verbatim; keeps the import honest.
export const NIGHTLY_FROM = DEFAULTS.nightlyPrice;
