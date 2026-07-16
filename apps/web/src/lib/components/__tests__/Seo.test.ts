// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { ComponentProps } from "svelte";
import { render } from "svelte/server";
import Seo from "../Seo.svelte";
import { lodgingBusinessSchema } from "$lib/seo";

/** Seo emits into <svelte:head>, so assertions run against `result.head`. */
function head(props: ComponentProps<typeof Seo>) {
  return render(Seo, { props }).head;
}

describe("Seo.svelte", () => {
  const base = {
    title: "Le site — Auberge du Vieux Pont",
    description: "Une description unique pour la page.",
    path: "/le-site",
  };

  it("renders the title and unique meta description", () => {
    const h = head(base);
    expect(h).toContain("<title>Le site — Auberge du Vieux Pont</title>");
    expect(h).toContain(
      '<meta name="description" content="Une description unique pour la page."',
    );
  });

  it("emits an absolute canonical URL built from path", () => {
    expect(head(base)).toContain(
      'rel="canonical" href="https://www.aubergeduvieuxpont.ca/le-site"',
    );
  });

  it("emits Open Graph and Twitter card tags", () => {
    const h = head(base);
    expect(h).toContain('property="og:title"');
    expect(h).toContain('property="og:url"');
    expect(h).toContain('property="og:image"');
    expect(h).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("omits the robots noindex tag by default and includes it when asked", () => {
    expect(head(base)).not.toContain('name="robots"');
    expect(head({ ...base, noindex: true })).toContain(
      'name="robots" content="noindex, follow"',
    );
  });

  it("inlines JSON-LD structured data as a script tag", () => {
    const h = head({ ...base, schema: [lodgingBusinessSchema()] });
    expect(h).toContain('<script type="application/ld+json">');
    expect(h).toContain('"@type":"LodgingBusiness"');
  });

  it("escapes < in JSON-LD so a string cannot close the script tag", () => {
    const h = head({ ...base, schema: [{ name: "a</script>b" }] });
    expect(h).not.toContain("a</script>b");
    expect(h).toContain("\\u003c/script>");
  });
});
