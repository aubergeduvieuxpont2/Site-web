import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { render, cleanup } from "@testing-library/svelte";

const pageFile = path.resolve(__dirname, "../reservation-confirmee/+page.svelte");
const pageTsFile = path.resolve(__dirname, "../reservation-confirmee/+page.ts");
const read = () => fs.readFileSync(pageFile, "utf-8");

const frFile = path.resolve(__dirname, "../../lib/messages/fr.ts");
const enFile = path.resolve(__dirname, "../../lib/messages/en.ts");
const readFr = () => fs.readFileSync(frFile, "utf-8");
const readEn = () => fs.readFileSync(enFile, "utf-8");

// Mock the $app/stores to provide a page store with a URL containing session_id.
vi.mock("$app/stores", () => {
  const mockPage = {
    url: new URL("http://localhost/reservation-confirmee?session_id=cs_test_123"),
  };
  return {
    page: {
      subscribe: (fn: (value: any) => void) => {
        fn(mockPage);
        return () => {};
      },
    },
  };
});

// Partially mock the API module to ensure no API calls are made.
vi.mock("$lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/api")>();
  return {
    ...actual,
    getAvailability: vi.fn(),
    createReservation: vi.fn(),
    getPublicSettings: vi.fn(),
  };
});

import Page from "../reservation-confirmee/+page.svelte";
import { getAvailability, createReservation, getPublicSettings } from "$lib/api";

const getAvailabilityMock = vi.mocked(getAvailability);
const createReservationMock = vi.mocked(createReservation);
const getPublicSettingsMock = vi.mocked(getPublicSettings);

describe("page-reservation-confirmee", () => {
  beforeEach(() => {
    getAvailabilityMock.mockReset();
    createReservationMock.mockReset();
    getPublicSettingsMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("page config", () => {
    it("disables prerender", () => {
      const config = fs.readFileSync(pageTsFile, "utf-8");
      expect(config).toContain("prerender = false");
    });
  });

  describe("success copy", () => {
    it("renders the page with data-testid reservation-confirmee", () => {
      expect(read()).toContain('data-testid="reservation-confirmee"');
    });

    it("reads session_id from the URL query string", () => {
      expect(read()).toContain("session_id");
      expect(read()).toContain("searchParams.get");
    });

    it("shows the session reference when sessionId is present", () => {
      const content = read();
      expect(content).toContain("confirmation.sessionLabel");
      expect(content).toContain("{#if sessionId}");
    });

    it("uses the t() helper from i18n for all copy", () => {
      const content = read();
      expect(content).toContain("from \"$lib/i18n.svelte\"");
      expect(content).toMatch(/t\('confirmation\./);
    });

    it("uses the page store from $app/stores to read URL params", () => {
      expect(read()).toContain('from "$app/stores"');
      expect(read()).toContain("$page");
    });

    it("has a Button linking back to the home page", () => {
      expect(read()).toContain('href="/"');
      expect(read()).toContain("confirmation.backHome");
    });

    it("includes a Seo component", () => {
      expect(read()).toContain("import Seo from");
      expect(read()).toContain("<Seo");
    });

    it("renders the confirmation success copy and displays the session_id", async () => {
      const { getByTestId, getByText } = render(Page);

      // Assert the root element is present.
      expect(getByTestId("reservation-confirmee")).toBeTruthy();

      // The confirmation title and body should be rendered.
      // Note: the actual text comes from the i18n dictionary, so we just check structure.
      const heading = getByTestId("reservation-confirmee").querySelector(".confirmee__heading");
      expect(heading).toBeTruthy();

      const body = getByTestId("reservation-confirmee").querySelector(".confirmee__body");
      expect(body).toBeTruthy();

      // The session_id should be displayed (from the query parameter).
      expect(getByText(/cs_test_123/)).toBeTruthy();
    });

    it("does not call any api-client functions", async () => {
      render(Page);

      // Verify no API calls were made.
      expect(getAvailabilityMock).not.toHaveBeenCalled();
      expect(createReservationMock).not.toHaveBeenCalled();
      expect(getPublicSettingsMock).not.toHaveBeenCalled();
    });
  });

  describe("i18n key parity", () => {
    it("fr dictionary has the confirmation namespace", () => {
      expect(readFr()).toContain("confirmation:");
    });

    it("en dictionary has the confirmation namespace", () => {
      expect(readEn()).toContain("confirmation:");
    });

    it("fr dictionary has confirmation.title", () => {
      const frContent = readFr();
      const nsStart = frContent.indexOf("confirmation:");
      const nsEnd = frContent.indexOf("};", nsStart);
      const nsBlock = frContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("title:");
    });

    it("en dictionary has confirmation.title", () => {
      const enContent = readEn();
      const nsStart = enContent.indexOf("confirmation:");
      const nsEnd = enContent.indexOf("};", nsStart);
      const nsBlock = enContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("title:");
    });

    it("fr dictionary has confirmation.body", () => {
      const frContent = readFr();
      const nsStart = frContent.indexOf("confirmation:");
      const nsEnd = frContent.indexOf("};", nsStart);
      const nsBlock = frContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("body:");
    });

    it("en dictionary has confirmation.body", () => {
      const enContent = readEn();
      const nsStart = enContent.indexOf("confirmation:");
      const nsEnd = enContent.indexOf("};", nsStart);
      const nsBlock = enContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("body:");
    });

    it("fr dictionary has confirmation.sessionLabel with percent interpolation", () => {
      const frContent = readFr();
      const nsStart = frContent.indexOf("confirmation:");
      const nsEnd = frContent.indexOf("};", nsStart);
      const nsBlock = frContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("sessionLabel:");
      expect(nsBlock).toContain("%session_id%");
    });

    it("en dictionary has confirmation.sessionLabel with percent interpolation", () => {
      const enContent = readEn();
      const nsStart = enContent.indexOf("confirmation:");
      const nsEnd = enContent.indexOf("};", nsStart);
      const nsBlock = enContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("sessionLabel:");
      expect(nsBlock).toContain("%session_id%");
    });

    it("fr dictionary has confirmation.backHome", () => {
      const frContent = readFr();
      const nsStart = frContent.indexOf("confirmation:");
      const nsEnd = frContent.indexOf("};", nsStart);
      const nsBlock = frContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("backHome:");
    });

    it("en dictionary has confirmation.backHome", () => {
      const enContent = readEn();
      const nsStart = enContent.indexOf("confirmation:");
      const nsEnd = enContent.indexOf("};", nsStart);
      const nsBlock = enContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("backHome:");
    });

    it("fr dictionary has the correct contact.payment keys", () => {
      const frContent = readFr();
      expect(frContent).toContain("payment:");
      const paymentStart = frContent.indexOf("payment:");
      const paymentBlock = frContent.slice(paymentStart, paymentStart + 700);
      expect(paymentBlock).toContain("heading:");
      expect(paymentBlock).toContain("holdMessage:");
      expect(paymentBlock).toContain("countdownLabel:");
      expect(paymentBlock).toContain("expiredTitle:");
      expect(paymentBlock).toContain("expiredBody:");
      expect(paymentBlock).toContain("backToForm:");
      expect(paymentBlock).toContain("unavailable:");
    });

    it("en dictionary has the correct contact.payment keys", () => {
      const enContent = readEn();
      expect(enContent).toContain("payment:");
      const paymentStart = enContent.indexOf("payment:");
      const paymentBlock = enContent.slice(paymentStart, paymentStart + 700);
      expect(paymentBlock).toContain("heading:");
      expect(paymentBlock).toContain("holdMessage:");
      expect(paymentBlock).toContain("countdownLabel:");
      expect(paymentBlock).toContain("expiredTitle:");
      expect(paymentBlock).toContain("expiredBody:");
      expect(paymentBlock).toContain("backToForm:");
      expect(paymentBlock).toContain("unavailable:");
    });

    it("fr payment.countdownLabel uses percent interpolation for minutes and seconds", () => {
      expect(readFr()).toContain("%minutes%");
      expect(readFr()).toContain("%seconds%");
    });

    it("en payment.countdownLabel uses percent interpolation for minutes and seconds", () => {
      expect(readEn()).toContain("%minutes%");
      expect(readEn()).toContain("%seconds%");
    });
  });
});
