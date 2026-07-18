import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseEnvelope, executeOp } from "../src/ops/registry";
import { executeContactUpsert } from "../src/ops/contact";
import { executeDealCreate, DealCreateSchema } from "../src/ops/deal";
import { executeNoteCreate } from "../src/ops/note";
import { executeListAdd, executeListRemove } from "../src/ops/list";
import { executeTimelineEvent } from "../src/ops/timeline";
import { executeContactGet } from "../src/ops/contactGet";
import { executeDealListByContact } from "../src/ops/dealList";
import type { Env } from "../src/env";

const mockEnv: Env = {
  HUBSPOT_TOKEN: "test-token",
  DB_CONN: "postgresql://test",
  HUBSPOT_PIPELINE_ID: "pipeline-123",
  HUBSPOT_DEALSTAGE_ID: "dealstage-456",
  HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID: "template-789",
};

describe("Operations", () => {
  describe("parseEnvelope", () => {
    it("parses valid contact.upsert envelope", () => {
      const body = {
        kind: "contact.upsert",
        payload: { email: "test@example.com", name: "Test" },
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.envelope.kind).toBe("contact.upsert");
        expect(result.envelope.payload).toEqual({ email: "test@example.com", name: "Test" });
      }
    });

    it("parses valid deal.create envelope with dedupeKey", () => {
      const body = {
        kind: "deal.create",
        payload: {
          contactEmail: "test@example.com",
          dealname: "Test Deal",
          amount: 100,
        },
        dedupeKey: "res-123",
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.envelope.kind).toBe("deal.create");
        expect(result.envelope.dedupeKey).toBe("res-123");
      }
    });

    it("rejects invalid kind", () => {
      const body = {
        kind: "invalid.op",
        payload: {},
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.status).toBe(400);
      }
    });

    it("rejects malformed payload for contact.upsert", () => {
      const body = {
        kind: "contact.upsert",
        payload: { email: "" },
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.status).toBe(400);
      }
    });

    it("rejects malformed JSON", () => {
      const result = parseEnvelope(null);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.status).toBe(400);
      }
    });

    it("accepts list.add with valid email", () => {
      const body = {
        kind: "list.add",
        payload: { listId: "123", email: "test@example.com" },
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(true);
    });

    it("rejects list.add with invalid email", () => {
      const body = {
        kind: "list.add",
        payload: { listId: "123", email: "invalid" },
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(false);
    });

    it("parses valid note.create envelope with body only", () => {
      const body = {
        kind: "note.create",
        payload: { body: "Test note" },
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.envelope.kind).toBe("note.create");
        expect(result.envelope.payload).toEqual({ body: "Test note" });
      }
    });

    it("parses valid note.create envelope with contactEmail and dealDedupeKey", () => {
      const body = {
        kind: "note.create",
        payload: {
          body: "Test note",
          contactEmail: "test@example.com",
          dealDedupeKey: "res-123",
        },
        dedupeKey: "note-456",
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.envelope.kind).toBe("note.create");
        expect(result.envelope.dedupeKey).toBe("note-456");
      }
    });

    it("rejects note.create with empty body", () => {
      const body = {
        kind: "note.create",
        payload: { body: "" },
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.status).toBe(400);
      }
    });

    it("parses valid timeline.event envelope with email only", () => {
      const body = {
        kind: "timeline.event",
        payload: { email: "test@example.com" },
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.envelope.kind).toBe("timeline.event");
        expect(result.envelope.payload).toEqual({ email: "test@example.com" });
      }
    });

    it("parses valid timeline.event envelope with templateId and tokens", () => {
      const body = {
        kind: "timeline.event",
        payload: {
          email: "test@example.com",
          templateId: "tmpl-123",
          tokens: { name: "Test", amount: 42 },
        },
        dedupeKey: "event-789",
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.envelope.kind).toBe("timeline.event");
        expect(result.envelope.payload).toEqual({
          email: "test@example.com",
          templateId: "tmpl-123",
          tokens: { name: "Test", amount: 42 },
        });
        expect(result.envelope.dedupeKey).toBe("event-789");
      }
    });

    it("rejects timeline.event with invalid email format", () => {
      const body = {
        kind: "timeline.event",
        payload: { email: "not-an-email" },
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.status).toBe(400);
      }
    });

    it("rejects timeline.event with empty email", () => {
      const body = {
        kind: "timeline.event",
        payload: { email: "" },
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.status).toBe(400);
      }
    });

    it("rejects timeline.event with missing email", () => {
      const body = {
        kind: "timeline.event",
        payload: { templateId: "tmpl-123" },
      };
      const result = parseEnvelope(body);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.status).toBe(400);
      }
    });
  });

  describe("Op Execution with Fetch Stubbed", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe("contact.upsert", () => {
      it("creates a new contact and returns hubspotId", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockImplementation((url: string, init?: RequestInit) => {
          if (url.includes("/crm/v3/objects/contacts/search")) {
            return Promise.resolve(
              new Response(JSON.stringify({ results: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          if (url.includes("/crm/v3/objects/contacts") && init?.method === "POST") {
            return Promise.resolve(
              new Response(JSON.stringify({ id: "contact-123" }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          return Promise.reject(new Error("Unexpected URL"));
        });

        const result = await executeContactUpsert(mockEnv, {
          email: "test@example.com",
          name: "Test User",
          phone: "555-1234",
        });

        expect(result.ok).toBe(true);
        expect(result.hubspotId).toBe("contact-123");
        expect(mockFetch).toHaveBeenCalledWith(
          "https://api.hubapi.com/crm/v3/objects/contacts",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              properties: {
                email: "test@example.com",
                firstname: "Test User",
                phone: "555-1234",
              },
            }),
          })
        );
      });

      it("finds existing contact by email (no update properties → no PATCH)", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              results: [{ id: "existing-contact-456" }],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          )
        );

        const result = await executeContactUpsert(mockEnv, {
          email: "existing@example.com",
        });

        expect(result.ok).toBe(true);
        expect(result.hubspotId).toBe("existing-contact-456");
        expect(mockFetch).toHaveBeenCalledWith(
          "https://api.hubapi.com/crm/v3/objects/contacts/search",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              filterGroups: [
                {
                  filters: [
                    {
                      propertyName: "email",
                      operator: "EQ",
                      value: "existing@example.com",
                    },
                  ],
                },
              ],
              limit: 1,
            }),
          })
        );
        // No PATCH since no non-empty update properties
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it("create path sends firstname/lastname/phone/company", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockImplementation((url: string, init?: RequestInit) => {
          if (url.includes("/crm/v3/objects/contacts/search")) {
            return Promise.resolve(
              new Response(JSON.stringify({ results: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          if (url.includes("/crm/v3/objects/contacts") && init?.method === "POST") {
            return Promise.resolve(
              new Response(JSON.stringify({ id: "new-contact-789" }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const result = await executeContactUpsert(mockEnv, {
          email: "new@example.com",
          firstname: "Jane",
          lastname: "Doe",
          phone: "555-4321",
          company: "Acme Inc",
        });

        expect(result.ok).toBe(true);
        expect(result.hubspotId).toBe("new-contact-789");

        const createCall = mockFetch.mock.calls.find(
          (call: any) =>
            call[0].includes("/crm/v3/objects/contacts") &&
            !call[0].includes("/search") &&
            call[1]?.method === "POST"
        );
        expect(createCall).toBeDefined();
        const body = JSON.parse(createCall[1].body);
        expect(body.properties).toEqual({
          email: "new@example.com",
          firstname: "Jane",
          lastname: "Doe",
          phone: "555-4321",
          company: "Acme Inc",
        });
      });

      it("update path PATCHes existing contact, omits empty properties", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockImplementation((url: string, init?: RequestInit) => {
          if (url.includes("/crm/v3/objects/contacts/search")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ results: [{ id: "existing-contact-456" }] }),
                { status: 200, headers: { "Content-Type": "application/json" } }
              )
            );
          }
          if (
            url.includes("/crm/v3/objects/contacts/existing-contact-456") &&
            init?.method === "PATCH"
          ) {
            return Promise.resolve(
              new Response(JSON.stringify({ id: "existing-contact-456" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const result = await executeContactUpsert(mockEnv, {
          email: "existing@example.com",
          firstname: "Jane",
          lastname: "",
          phone: "555-9999",
          company: "",
        });

        expect(result.ok).toBe(true);
        expect(result.hubspotId).toBe("existing-contact-456");

        const patchCall = mockFetch.mock.calls.find(
          (call: any) =>
            call[0].includes("/crm/v3/objects/contacts/existing-contact-456") &&
            call[1]?.method === "PATCH"
        );
        expect(patchCall).toBeDefined();
        const body = JSON.parse(patchCall[1].body);
        expect(body.properties).toEqual({
          firstname: "Jane",
          phone: "555-9999",
        });
        expect(body.properties).not.toHaveProperty("lastname");
        expect(body.properties).not.toHaveProperty("company");
      });
    });

    describe("deal.create", () => {
      it("creates deal and associates with contact", async () => {
        const mockFetch = global.fetch as any;
        let callCount = 0;

        mockFetch.mockImplementation((url: string, init?: RequestInit) => {
          callCount++;

          if (url.includes("/crm/v3/objects/deals/search") && callCount === 1) {
            return Promise.resolve(
              new Response(JSON.stringify({ results: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }

          if (url.includes("/crm/v3/objects/contacts/search")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  results: [{ id: "contact-789" }],
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }
              )
            );
          }

          if (url.includes("/crm/v3/objects/deals") && init?.method === "POST") {
            return Promise.resolve(
              new Response(JSON.stringify({ id: "deal-123" }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
              })
            );
          }

          if (url.includes("/crm/v4/objects/deals/deal-123/associations/contacts/contact-789")) {
            return Promise.resolve(
              new Response(JSON.stringify({}), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }

          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const result = await executeDealCreate(
          mockEnv,
          {
            contactEmail: "test@example.com",
            dealname: "Beach Vacation",
            amount: 1500,
            arrive: "2024-07-01",
            depart: "2024-07-08",
            room: "Deluxe",
            people: 2,
            description: "Summer getaway",
          },
          "reservation-123"
        );

        expect(result.ok).toBe(true);
        expect(result.hubspotId).toBe("deal-123");

        const associationCall = mockFetch.mock.calls.find((call: any) =>
          call[0].includes("/crm/v4/objects/deals/deal-123/associations/contacts/contact-789")
        );
        expect(associationCall).toBeDefined();
        if (associationCall) {
          const body = JSON.parse(associationCall[1].body);
          expect(body[0].associationTypeId).toBe(3);
        }
      });

      it("returns existing deal when dedupeKey matches", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockImplementation((url: string, init?: any) => {
          if (url.includes("/crm/v3/objects/contacts/search")) {
            return Promise.resolve(
              new Response(JSON.stringify({ results: [{ id: "contact-789" }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          if (url.includes("/crm/v3/objects/deals/search")) {
            return Promise.resolve(
              new Response(JSON.stringify({ results: [{ id: "existing-deal-456" }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          if (url.includes("/crm/v4/objects/deals/existing-deal-456/associations/contacts/contact-789")) {
            return Promise.resolve(
              new Response(JSON.stringify({}), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const result = await executeDealCreate(
          mockEnv,
          {
            contactEmail: "test@example.com",
            dealname: "Duplicate Deal",
          },
          "reservation-123"
        );

        expect(result.ok).toBe(true);
        expect(result.hubspotId).toBe("existing-deal-456");
      });

      it("maps roomCount to number_of_rooms property on the deal", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockImplementation((url: string, init?: any) => {
          if (url.includes("/crm/v3/objects/contacts/search")) {
            return Promise.resolve(
              new Response(JSON.stringify({ results: [{ id: "contact-789" }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          if (url.includes("/crm/v3/objects/deals") && init?.method === "POST") {
            return Promise.resolve(
              new Response(JSON.stringify({ id: "deal-123" }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          if (url.includes("/crm/v4/objects/deals/deal-123/associations/contacts/contact-789")) {
            return Promise.resolve(
              new Response(JSON.stringify({}), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const result = await executeDealCreate(mockEnv, {
          contactEmail: "test@example.com",
          dealname: "Room Booking",
          roomCount: 5,
        });

        expect(result.ok).toBe(true);

        const createCall = mockFetch.mock.calls.find(
          (call: any) =>
            call[0].includes("/crm/v3/objects/deals") &&
            call[1]?.method === "POST" &&
            !call[0].includes("search")
        );
        expect(createCall).toBeDefined();
        const body = JSON.parse(createCall[1].body);
        expect(body.properties.number_of_rooms).toBe(5);
      });

      it("omits number_of_rooms when roomCount is undefined", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockImplementation((url: string, init?: any) => {
          if (url.includes("/crm/v3/objects/contacts/search")) {
            return Promise.resolve(
              new Response(JSON.stringify({ results: [{ id: "contact-789" }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          if (url.includes("/crm/v3/objects/deals") && init?.method === "POST") {
            return Promise.resolve(
              new Response(JSON.stringify({ id: "deal-123" }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          if (url.includes("/crm/v4/objects/deals/deal-123/associations/contacts/contact-789")) {
            return Promise.resolve(
              new Response(JSON.stringify({}), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        await executeDealCreate(mockEnv, {
          contactEmail: "test@example.com",
          dealname: "No Rooms",
        });

        const createCall = mockFetch.mock.calls.find(
          (call: any) =>
            call[0].includes("/crm/v3/objects/deals") &&
            call[1]?.method === "POST" &&
            !call[0].includes("search")
        );
        expect(createCall).toBeDefined();
        const body = JSON.parse(createCall[1].body);
        expect(body.properties).not.toHaveProperty("number_of_rooms");
      });

      it("accepts a numeric roomCount and rejects a string roomCount in the schema", () => {
        expect(
          DealCreateSchema.parse({
            contactEmail: "test@example.com",
            dealname: "Valid",
            roomCount: 5,
          }).roomCount
        ).toBe(5);

        expect(
          DealCreateSchema.parse({
            contactEmail: "test@example.com",
            dealname: "Optional omitted",
          }).roomCount
        ).toBeUndefined();

        expect(
          DealCreateSchema.safeParse({
            contactEmail: "test@example.com",
            dealname: "Bad type",
            roomCount: "5",
          }).success
        ).toBe(false);
      });
    });

    describe("note.create", () => {
      it("creates note with contact and deal associations", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockImplementation((url: string) => {
          if (url.includes("/crm/v3/objects/contacts/search")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  results: [{ id: "contact-999" }],
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }
              )
            );
          }
          if (url.includes("/crm/v3/objects/deals/search")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  results: [{ id: "deal-888" }],
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }
              )
            );
          }
          if (url.includes("/crm/v3/objects/notes/search")) {
            return Promise.resolve(
              new Response(JSON.stringify({ results: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          if (url.includes("/crm/v3/objects/notes")) {
            return Promise.resolve(
              new Response(JSON.stringify({ id: "note-111" }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          return Promise.reject(new Error("Unexpected URL"));
        });

        const result = await executeNoteCreate(
          mockEnv,
          {
            body: "Guest left positive feedback",
            contactEmail: "guest@example.com",
            dealDedupeKey: "reservation-123",
          },
          "note-dedupe-456"
        );

        expect(result.ok).toBe(true);
        expect(result.hubspotId).toBe("note-111");

        const noteCreateCall = mockFetch.mock.calls.find((call: any) =>
          call[0].includes("/crm/v3/objects/notes") &&
          !call[0].includes("/search")
        );
        expect(noteCreateCall).toBeDefined();
        if (noteCreateCall) {
          const body = JSON.parse(noteCreateCall[1].body);
          expect(body.properties.hs_note_body).toBe("Guest left positive feedback");
          expect(body.properties.hs_note_dedup_key).toBe("note-dedupe-456");
          expect(body.associations).toContainEqual(
            expect.objectContaining({
              id: "contact-999",
              types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1 }],
            })
          );
          expect(body.associations).toContainEqual(
            expect.objectContaining({
              id: "deal-888",
              types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 4 }],
            })
          );
        }
      });

      it("creates note with body only", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({ id: "note-222" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          })
        );

        const result = await executeNoteCreate(mockEnv, {
          body: "Standalone note",
        });

        expect(result.ok).toBe(true);
        expect(result.hubspotId).toBe("note-222");
      });
    });

    describe("list.add", () => {
      it("adds email to list with encoded listId", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );

        const result = await executeListAdd(mockEnv, {
          listId: "list-with-special/chars",
          email: "user@example.com",
        });

        expect(result.ok).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(
            "/crm/v3/lists/list-with-special%2Fchars/memberships/add"
          ),
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ emails: ["user@example.com"] }),
          })
        );
      });
    });

    describe("list.remove", () => {
      it("removes email from list", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );

        const result = await executeListRemove(mockEnv, {
          listId: "list-123",
          email: "user@example.com",
        });

        expect(result.ok).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          "https://api.hubapi.com/crm/v3/lists/list-123/memberships/remove",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ emails: ["user@example.com"] }),
          })
        );
      });
    });

    describe("timeline.event", () => {
      it("creates timeline event with templateId from env", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({ id: "event-333" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          })
        );

        const result = await executeTimelineEvent(
          mockEnv,
          {
            email: "user@example.com",
            tokens: { guestName: "John", nights: 3 },
          },
          "event-dedupe-789"
        );

        expect(result.ok).toBe(true);
        expect(result.hubspotId).toBe("event-333");

        expect(mockFetch).toHaveBeenCalledWith(
          "https://api.hubapi.com/crm/v3/timeline/events",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              email: "user@example.com",
              templateId: "template-789",
              tokens: { guestName: "John", nights: 3 },
              id: "event-dedupe-789",
            }),
          })
        );
      });

      it("creates timeline event with explicit templateId", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({ id: "event-444" }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          })
        );

        const result = await executeTimelineEvent(mockEnv, {
          email: "user@example.com",
          templateId: "custom-template-999",
        });

        expect(result.ok).toBe(true);
        const callBody = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(callBody.templateId).toBe("custom-template-999");
      });
    });

    describe("Error Normalization", () => {
      it("normalizes 400 error on contact creation", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockImplementation((url: string) => {
          if (url.includes("/crm/v3/objects/contacts/search")) {
            return Promise.resolve(
              new Response(JSON.stringify({ results: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          if (url.includes("/crm/v3/objects/contacts")) {
            return Promise.resolve(
              new Response(JSON.stringify({ error: "Invalid email" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              })
            );
          }
          return Promise.reject(new Error("Unexpected URL"));
        });

        try {
          await executeContactUpsert(mockEnv, {
            email: "test@example.com",
          });
          expect.fail("Should have thrown");
        } catch (err: any) {
          expect(err.ok).toBe(false);
          expect(err.status).toBe(400);
        }
      });

      it("normalizes 429 transient error with Retry-After", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockImplementation(() => {
          return Promise.resolve(
            new Response(JSON.stringify({ message: "Rate limited" }), {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "60",
              },
            })
          );
        });

        try {
          await executeContactUpsert(mockEnv, {
            email: "test@example.com",
          });
          expect.fail("Should have thrown");
        } catch (err: any) {
          expect(err.ok).toBe(false);
          expect(err.status).toBe(429);
          expect(err.retryAfterSeconds).toBe(60);
        }
      });

      it("normalizes 500 server error", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockImplementation(() => {
          return Promise.resolve(
            new Response(JSON.stringify({ message: "Internal server error" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            })
          );
        });

        try {
          await executeContactUpsert(mockEnv, {
            email: "test@example.com",
          });
          expect.fail("Should have thrown");
        } catch (err: any) {
          expect(err.ok).toBe(false);
          expect(err.status).toBe(500);
          expect(err.message).toBe("Internal server error");
        }
      });

      it("normalizes non-JSON error response", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockImplementation(() => {
          return Promise.resolve(
            new Response("Internal error", {
              status: 500,
              headers: { "Content-Type": "text/plain" },
            })
          );
        });

        try {
          await executeContactUpsert(mockEnv, {
            email: "test@example.com",
          });
          expect.fail("Should have thrown");
        } catch (err: any) {
          expect(err.ok).toBe(false);
          expect(err.status).toBe(500);
          expect(err.message).toContain("HubSpot API error");
        }
      });
    });

    describe("contact.get", () => {
      it("returns contact data when contact is found", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              results: [{ id: "contact-abc", properties: { email: "test@example.com", firstname: "Test" } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );

        const result = await executeContactGet(mockEnv, { email: "test@example.com" });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.hubspotId).toBe("contact-abc");
          expect(result.data).toEqual({ email: "test@example.com", firstname: "Test" });
        }
      });

      it("returns normalized 404 when contact is not found", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({ results: [] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );

        const result = await executeContactGet(mockEnv, { email: "missing@example.com" });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.status).toBe(404);
        }
      });
    });

    describe("deal.listByContact", () => {
      it("returns deals array when contact has deals", async () => {
        const mockFetch = global.fetch as any;
        let callCount = 0;

        mockFetch.mockImplementation((url: string) => {
          callCount++;
          if (url.includes("/crm/v3/objects/contacts/search")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ results: [{ id: "contact-xyz" }] }),
                { status: 200, headers: { "Content-Type": "application/json" } }
              )
            );
          }
          if (url.includes("/crm/v4/objects/contacts/contact-xyz/associations/deals")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ results: [{ toObjectId: "deal-1" }, { toObjectId: "deal-2" }] }),
                { status: 200, headers: { "Content-Type": "application/json" } }
              )
            );
          }
          if (url.includes("/crm/v3/objects/deals/batch/read")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ results: [{ id: "deal-1", properties: { dealname: "Stay A" } }, { id: "deal-2", properties: { dealname: "Stay B" } }] }),
                { status: 200, headers: { "Content-Type": "application/json" } }
              )
            );
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const result = await executeDealListByContact(mockEnv, { email: "test@example.com" });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(Array.isArray(result.data)).toBe(true);
          expect((result.data as any[]).length).toBe(2);
        }
      });

      it("returns empty array when contact has no deals", async () => {
        const mockFetch = global.fetch as any;

        mockFetch.mockImplementation((url: string) => {
          if (url.includes("/crm/v3/objects/contacts/search")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ results: [{ id: "contact-xyz" }] }),
                { status: 200, headers: { "Content-Type": "application/json" } }
              )
            );
          }
          if (url.includes("/crm/v4/objects/contacts/contact-xyz/associations/deals")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ results: [] }),
                { status: 200, headers: { "Content-Type": "application/json" } }
              )
            );
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const result = await executeDealListByContact(mockEnv, { email: "nodeals@example.com" });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data).toEqual([]);
        }
      });

      it("returns empty array when contact is not found", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({ results: [] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );

        const result = await executeDealListByContact(mockEnv, { email: "nobody@example.com" });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data).toEqual([]);
        }
      });
    });

    describe("executeOp dispatch", () => {
      it("dispatches to correct handler based on envelope kind", async () => {
        const mockFetch = global.fetch as any;
        mockFetch.mockResolvedValueOnce(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );

        const result = await executeOp(mockEnv, {
          kind: "list.add",
          payload: { listId: "list-id", email: "test@example.com" },
        });

        expect(result.ok).toBe(true);
      });

      it("returns error for unknown operation kind", async () => {
        const result = await executeOp(mockEnv, {
          kind: "unknown.op" as any,
          payload: {},
        });

        expect(result.ok).toBe(false);
        expect((result as any).status).toBe(400);
      });
    });
  });
});
