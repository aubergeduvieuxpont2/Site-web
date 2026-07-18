import { describe, it, expect } from "vitest";
import { verifyAuth, AIRBNB_DOMAINS, EXPEDIA_DOMAINS } from "../src/verifyAuth";

describe("verifyAuth (T-EI-001a)", () => {
  it("accepts a domain-aligned DKIM pass", () => {
    const authResults =
      "mx.google.com; dkim=pass header.i=@airbnb.com header.s=ga1 header.b=abc; spf=pass smtp.mailfrom=bounce.airbnb.com";
    expect(verifyAuth({ authResults, allowedDomains: AIRBNB_DOMAINS })).toBe(true);
  });

  it("accepts a DKIM pass on a subdomain of an allowed domain", () => {
    const authResults = "mx.google.com; dkim=pass header.d=e.airbnb.com";
    expect(verifyAuth({ authResults, allowedDomains: AIRBNB_DOMAINS })).toBe(true);
  });

  it("accepts a domain-aligned SPF pass when DKIM is absent", () => {
    const authResults = "mx.google.com; spf=pass smtp.mailfrom=bounce.expedia.com";
    expect(verifyAuth({ authResults, allowedDomains: EXPEDIA_DOMAINS })).toBe(true);
  });

  it("rejects a DKIM pass whose domain is unrelated", () => {
    const authResults = "mx.google.com; dkim=pass header.d=evil.com";
    expect(verifyAuth({ authResults, allowedDomains: AIRBNB_DOMAINS })).toBe(false);
  });

  it("rejects a lookalike domain that merely contains the allowed domain", () => {
    const authResults = "mx.google.com; dkim=pass header.d=airbnb.com.evil.io";
    expect(verifyAuth({ authResults, allowedDomains: AIRBNB_DOMAINS })).toBe(false);
  });

  it("rejects a non-pass result", () => {
    expect(
      verifyAuth({
        authResults: "mx.google.com; dkim=fail header.d=airbnb.com",
        allowedDomains: AIRBNB_DOMAINS,
      }),
    ).toBe(false);
    expect(
      verifyAuth({
        authResults: "mx.google.com; dkim=none; spf=none",
        allowedDomains: AIRBNB_DOMAINS,
      }),
    ).toBe(false);
  });

  it("rejects a null / empty Authentication-Results header", () => {
    expect(verifyAuth({ authResults: null, allowedDomains: AIRBNB_DOMAINS })).toBe(false);
    expect(verifyAuth({ authResults: undefined, allowedDomains: AIRBNB_DOMAINS })).toBe(false);
    expect(verifyAuth({ authResults: "", allowedDomains: AIRBNB_DOMAINS })).toBe(false);
  });

  it("does not accept an SPF pass aligned to a different provider", () => {
    const authResults = "mx.google.com; spf=pass smtp.mailfrom=bounce.expedia.com";
    expect(verifyAuth({ authResults, allowedDomains: AIRBNB_DOMAINS })).toBe(false);
  });
});
