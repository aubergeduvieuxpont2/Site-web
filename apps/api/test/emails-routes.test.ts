import { describe, it, expect } from "vitest";
import { createEmailsRouter } from "../src/emails/routes";
import type { User } from "../src/auth/session";
import type { Context } from "hono";

describe("Email routes", () => {
  const mockAdmin: User = { id: 1, email: "admin@example.com", name: "Admin", role: "admin" };
  const mockGuest: User = { id: 2, email: "guest@example.com", name: "Guest", role: "guest" };

  const createRouter = (user: User | null) => {
    return createEmailsRouter({
      authenticate: async () => user,
    });
  };

  describe("GET /api/admin/emails/templates", () => {
    it("returns 200 with 8 templates as admin", async () => {
      const router = createRouter(mockAdmin);
      const app = router;

      const req = new Request("http://localhost/api/admin/emails/templates");
      const res = await app.request(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.templates).toHaveLength(8);
      expect(data.templates[0]).toHaveProperty("key");
      expect(data.templates[0]).toHaveProperty("name");
      expect(data.templates[0]).toHaveProperty("subject");
      expect(data.templates[0].name).toHaveProperty("fr");
      expect(data.templates[0].name).toHaveProperty("en");
      expect(data.templates[0].subject).toHaveProperty("fr");
      expect(data.templates[0].subject).toHaveProperty("en");
    });

    it("returns 401 without session", async () => {
      const router = createRouter(null);
      const app = router;

      const req = new Request("http://localhost/api/admin/emails/templates");
      const res = await app.request(req);

      expect(res.status).toBe(401);
    });

    it("returns 403 as non-admin", async () => {
      const router = createRouter(mockGuest);
      const app = router;

      const req = new Request("http://localhost/api/admin/emails/templates");
      const res = await app.request(req);

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/admin/emails/preview", () => {
    it("returns 200 with subject, html, text for valid template and locale", async () => {
      const router = createRouter(mockAdmin);
      const app = router;

      const req = new Request("http://localhost/api/admin/emails/preview?template=welcome&locale=fr");
      const res = await app.request(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("subject");
      expect(data).toHaveProperty("html");
      expect(data).toHaveProperty("text");
      expect(typeof data.subject).toBe("string");
      expect(typeof data.html).toBe("string");
      expect(typeof data.text).toBe("string");
      expect(data.subject.length).toBeGreaterThan(0);
      expect(data.html.length).toBeGreaterThan(0);
      expect(data.text.length).toBeGreaterThan(0);
    });

    it("returns 400 for unknown template", async () => {
      const router = createRouter(mockAdmin);
      const app = router;

      const req = new Request("http://localhost/api/admin/emails/preview?template=bogus&locale=fr");
      const res = await app.request(req);

      expect(res.status).toBe(400);
    });

    it("returns 400 for unknown locale", async () => {
      const router = createRouter(mockAdmin);
      const app = router;

      const req = new Request("http://localhost/api/admin/emails/preview?template=welcome&locale=de");
      const res = await app.request(req);

      expect(res.status).toBe(400);
    });

    it("returns 401 without session", async () => {
      const router = createRouter(null);
      const app = router;

      const req = new Request("http://localhost/api/admin/emails/preview?template=welcome&locale=fr");
      const res = await app.request(req);

      expect(res.status).toBe(401);
    });

    it("returns 403 as non-admin", async () => {
      const router = createRouter(mockGuest);
      const app = router;

      const req = new Request("http://localhost/api/admin/emails/preview?template=welcome&locale=fr");
      const res = await app.request(req);

      expect(res.status).toBe(403);
    });
  });
});
