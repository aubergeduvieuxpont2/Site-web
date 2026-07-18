import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeInvoiceCreate } from "../src/ops/invoice";
import { executeNoteCreate } from "../src/ops/note";
import { executeContactUpsert, resolveOrCreateContactByEmail } from "../src/ops/contact";
import { ContactGetByIdSchema } from "../src/ops/contactGetById";
import {
  ContactUpdateByIdSchema,
  executeContactUpdateById,
} from "../src/ops/contactUpdateById";
import { assertNumericId } from "../src/ops/ids";
import type { Env } from "../src/env";

const mockEnv: Env = {
  HUBSPOT_TOKEN: "test-token",
  DB_CONN: "postgresql://test",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isCreatePost(call: any, base: string): boolean {
  return (
    call[0].includes(base) &&
    !call[0].includes("/search") &&
    call[1]?.method === "POST"
  );
}

describe("Hardening", () => {
  describe("H5 — dedupe (search before create)", () => {
    beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
    afterEach(() => vi.restoreAllMocks());

    it("invoice.create returns the existing invoice and does not POST a duplicate", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/crm/v3/objects/contacts/search")) {
          return Promise.resolve(jsonResponse({ results: [{ id: "contact-1" }] }));
        }
        if (url.includes("/crm/v3/objects/invoices/search")) {
          return Promise.resolve(jsonResponse({ results: [{ id: "invoice-existing" }] }));
        }
        if (url.includes("/crm/v4/objects/invoices/invoice-existing/associations")) {
          return Promise.resolve(jsonResponse({}));
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await executeInvoiceCreate(
        mockEnv,
        { contactEmail: "guest@example.com", amount: 100, description: "Stay", currency: "CAD" },
        "res-42"
      );

      expect(result.ok).toBe(true);
      expect(result.hubspotId).toBe("invoice-existing");

      const createCall = mockFetch.mock.calls.find((c: any) =>
        isCreatePost(c, "/crm/v3/objects/invoices")
      );
      expect(createCall).toBeUndefined();
    });

    it("invoice.create writes dedupe_key on the created invoice", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockImplementation((url: string, init?: any) => {
        if (url.includes("/crm/v3/objects/contacts/search")) {
          return Promise.resolve(jsonResponse({ results: [{ id: "contact-1" }] }));
        }
        if (url.includes("/crm/v3/objects/invoices/search")) {
          return Promise.resolve(jsonResponse({ results: [] }));
        }
        if (url.includes("/crm/v3/objects/invoices") && init?.method === "POST") {
          return Promise.resolve(jsonResponse({ id: "invoice-new" }, 201));
        }
        if (url.includes("/crm/v4/objects/invoices/invoice-new/associations")) {
          return Promise.resolve(jsonResponse({}));
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await executeInvoiceCreate(
        mockEnv,
        { contactEmail: "guest@example.com", amount: 100, description: "Stay", currency: "CAD" },
        "res-99"
      );

      expect(result.hubspotId).toBe("invoice-new");
      const createCall = mockFetch.mock.calls.find((c: any) =>
        isCreatePost(c, "/crm/v3/objects/invoices")
      );
      expect(createCall).toBeDefined();
      expect(JSON.parse(createCall[1].body).properties.dedupe_key).toBe("res-99");
    });

    it("note.create returns the existing note and does not POST a duplicate", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/crm/v3/objects/notes/search")) {
          return Promise.resolve(jsonResponse({ results: [{ id: "note-existing" }] }));
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await executeNoteCreate(
        mockEnv,
        { body: "Guest feedback", contactEmail: "guest@example.com" },
        "note-dedupe-1"
      );

      expect(result.ok).toBe(true);
      expect(result.hubspotId).toBe("note-existing");
      // Only the search happened: no contact resolve, no note create POST.
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const createCall = mockFetch.mock.calls.find((c: any) =>
        isCreatePost(c, "/crm/v3/objects/notes")
      );
      expect(createCall).toBeUndefined();
    });
  });

  describe("M16 — note body is sanitized/escaped", () => {
    beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
    afterEach(() => vi.restoreAllMocks());

    it("HTML-escapes markup and strips control chars in hs_note_body", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValue(jsonResponse({ id: "note-1" }, 201));

      const NUL = String.fromCharCode(0);
      const BELL = String.fromCharCode(7);
      const rawBody =
        `<script>alert('x')</script> & "q"` + NUL + BELL + "\ttab-kept\nnl-kept";

      await executeNoteCreate(mockEnv, { body: rawBody });

      const createCall = mockFetch.mock.calls.find((c: any) =>
        c[0].includes("/crm/v3/objects/notes")
      );
      const noteBody = JSON.parse(createCall[1].body).properties.hs_note_body;
      expect(noteBody).not.toContain("<script>");
      expect(noteBody).toContain("&lt;script&gt;");
      expect(noteBody).toContain("&amp;");
      expect(noteBody).toContain("&quot;");
      expect(noteBody).toContain("&#39;");
      // Control chars removed, tab/newline preserved.
      expect(noteBody).not.toContain(NUL);
      expect(noteBody).not.toContain(BELL);
      expect(noteBody).toContain("\ttab-kept");
      expect(noteBody).toContain("\nnl-kept");
    });
  });

  describe("M13 — object id validation", () => {
    it("ContactGetByIdSchema rejects a non-numeric id", () => {
      expect(ContactGetByIdSchema.safeParse({ contactId: "123" }).success).toBe(true);
      expect(ContactGetByIdSchema.safeParse({ contactId: "../deals/9" }).success).toBe(false);
      expect(ContactGetByIdSchema.safeParse({ contactId: "12a" }).success).toBe(false);
    });

    it("ContactUpdateByIdSchema rejects a non-numeric id", () => {
      expect(
        ContactUpdateByIdSchema.safeParse({
          contactId: "10/associations",
          properties: { email: "a@b.com" },
        }).success
      ).toBe(false);
    });

    it("assertNumericId throws a permanent (400) error for a bad id", () => {
      expect(() => assertNumericId("42")).not.toThrow();
      try {
        assertNumericId("../x", "contactId");
        throw new Error("should have thrown");
      } catch (err: any) {
        expect(err.ok).toBe(false);
        expect(err.status).toBe(400);
      }
    });
  });

  describe("M14 — contact.updateById property allow-list", () => {
    beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
    afterEach(() => vi.restoreAllMocks());

    it("schema rejects a non-writable property key", () => {
      expect(
        ContactUpdateByIdSchema.safeParse({
          contactId: "10",
          properties: { hs_lead_status: "NEW" },
        }).success
      ).toBe(false);
      expect(
        ContactUpdateByIdSchema.safeParse({
          contactId: "10",
          properties: { email: "a@b.com", firstname: "A" },
        }).success
      ).toBe(true);
    });

    it("execute strips any non-writable key before PATCH (drain-path defense)", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValue(jsonResponse({ id: "10" }));

      // Bypass the schema (simulating an unvalidated drain payload).
      await executeContactUpdateById(mockEnv, {
        contactId: "10",
        properties: { email: "a@b.com", hs_lead_status: "NEW", owner: "x" } as any,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.properties).toEqual({ email: "a@b.com" });
    });
  });

  describe("M15 — contact resolution rethrows transient errors", () => {
    beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
    afterEach(() => vi.restoreAllMocks());

    it("resolveOrCreateContactByEmail rethrows a 429 instead of creating", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValue(jsonResponse({ message: "rate limited" }, 429));

      await expect(
        resolveOrCreateContactByEmail(mockEnv, "guest@example.com")
      ).rejects.toMatchObject({ ok: false, status: 429 });

      // No CREATE POST should have been issued.
      const createCall = mockFetch.mock.calls.find((c: any) =>
        isCreatePost(c, "/crm/v3/objects/contacts")
      );
      expect(createCall).toBeUndefined();
    });

    it("executeContactUpsert rethrows a 429 instead of creating a duplicate", async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValue(jsonResponse({ message: "rate limited" }, 429));

      await expect(
        executeContactUpsert(mockEnv, { email: "guest@example.com" })
      ).rejects.toMatchObject({ ok: false, status: 429 });

      const createCall = mockFetch.mock.calls.find((c: any) =>
        isCreatePost(c, "/crm/v3/objects/contacts")
      );
      expect(createCall).toBeUndefined();
    });
  });
});
