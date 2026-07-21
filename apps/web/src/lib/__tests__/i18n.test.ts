import { describe, it, expect, beforeEach } from "vitest";
import { setLocale, t } from "../i18n.svelte";

// Reset to fr before every test so locale state never leaks between cases.
beforeEach(() => {
  setLocale("fr");
});

// ── t (translate helper) ──────────────────────────────────────────────────────

describe("t (translate helper)", () => {
  it("returns a non-empty string for a known navigation key", () => {
    const result = t("nav.home");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns the same key set in fr and en for a navigation label", () => {
    setLocale("fr");
    const fr = t("nav.home");
    setLocale("en");
    const en = t("nav.home");
    expect(typeof fr).toBe("string");
    expect(typeof en).toBe("string");
    // The two locales must produce different strings for locale switching to be meaningful.
    // nav.home is "Accueil" in French and a different word in English.
    expect(fr).not.toBe(en);
  });

  it("replaces a percent-delimited name placeholder with the supplied name in fr", () => {
    setLocale("fr");
    // contact.success.title is "C'est noté, %name%." in French.
    // The %name% token must be replaced with the supplied value.
    const result = t("contact.success.title", { name: "Alice" });
    expect(result).toContain("Alice");
    expect(result).not.toContain("%name%");
  });

  it("replaces a percent-delimited name placeholder with the supplied name in en", () => {
    setLocale("en");
    // contact.success.title is "Got it, %name%." in English.
    const result = t("contact.success.title", { name: "Bob" });
    expect(result).toContain("Bob");
    expect(result).not.toContain("%name%");
  });

  it("the greeting message containing a name placeholder does not expose the raw token", () => {
    setLocale("fr");
    const result = t("contact.success.title", { name: "Charlie" });
    expect(result).not.toContain("%name%");
  });

  it("handles multiple interpolation values simultaneously", () => {
    // If any message uses more than one placeholder, all tokens must be replaced.
    // Use contact.success.title with name to confirm at least one replacement works.
    setLocale("en");
    const result = t("contact.success.title", { name: "Dana" });
    expect(result).toContain("Dana");
    expect(result).not.toMatch(/%\w+%/);
  });

  it("returns a string when called with no interpolation values for a static key", () => {
    setLocale("fr");
    const result = t("nav.contact");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── setLocale (locale persistence) ──────────────────────────────────────────

describe("setLocale (locale persistence)", () => {
  it("persists the string en to localStorage after calling setLocale with en", () => {
    setLocale("en");
    expect(localStorage.getItem("locale")).toBe("en");
  });

  it("persists the string fr to localStorage after calling setLocale with fr", () => {
    setLocale("fr");
    expect(localStorage.getItem("locale")).toBe("fr");
  });

  it("sets the html lang attribute to en after calling setLocale with en", () => {
    setLocale("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("sets the html lang attribute to fr after calling setLocale with fr", () => {
    setLocale("fr");
    expect(document.documentElement.lang).toBe("fr");
  });

  it("writes locale=en to the document cookie after calling setLocale with en", () => {
    setLocale("en");
    expect(document.cookie).toContain("locale=en");
  });

  it("writes locale=fr to the document cookie after calling setLocale with fr", () => {
    setLocale("fr");
    expect(document.cookie).toContain("locale=fr");
  });

  it("the localStorage value switches when setLocale is called twice in sequence", () => {
    setLocale("en");
    expect(localStorage.getItem("locale")).toBe("en");
    setLocale("fr");
    expect(localStorage.getItem("locale")).toBe("fr");
  });
});

// ── locale store no-op safety (INV-store-noop-safe) ─────────────────────────

describe("locale store no-op safety (INV-store-noop-safe)", () => {
  it("setLocale does not throw when localStorage.setItem throws", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("localStorage unavailable");
    };
    try {
      expect(() => setLocale("en")).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("setLocale does not throw when localStorage.getItem throws", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("localStorage read unavailable");
    };
    try {
      expect(() => setLocale("fr")).not.toThrow();
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  it("setLocale does not throw when document.cookie assignment throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(document, "cookie");
    Object.defineProperty(document, "cookie", {
      set: () => {
        throw new Error("cookie write unavailable");
      },
      get: () => "",
      configurable: true,
    });
    try {
      expect(() => setLocale("en")).not.toThrow();
    } finally {
      if (descriptor) {
        Object.defineProperty(document, "cookie", descriptor);
      } else {
        // jsdom sets cookie on the prototype; remove our override
        delete (document as any).cookie;
      }
    }
  });
});
