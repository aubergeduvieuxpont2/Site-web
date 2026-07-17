import { Hono, type Context } from "hono";
import type { User } from "../auth/session";
import { renderEmail } from "./render";
import { MANIFEST, isTemplateKey, isLocale } from "./manifest";
import { SAMPLES } from "./templates";

type Bindings = { DB_CONN: string; HUBSPOT: Fetcher; ADMIN_EMAIL: string };

export function createEmailsRouter(deps: { authenticate: (c: Context<{ Bindings: Bindings }>) => Promise<User | null> }) {
  const router = new Hono<{ Bindings: Bindings }>();

  router.get("/api/admin/emails/templates", async (c) => {
    const user = await deps.authenticate(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }

    const templates = Object.entries(MANIFEST).map(([key, entry]) => ({
      key,
      name: entry.name,
      subject: entry.subject,
    }));

    return c.json({ templates });
  });

  router.get("/api/admin/emails/preview", async (c) => {
    const user = await deps.authenticate(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }

    const templateParam = c.req.query("template");
    const localeParam = c.req.query("locale");

    if (!isTemplateKey(templateParam)) {
      return c.json({ error: "Invalid template" }, 400);
    }
    if (!isLocale(localeParam)) {
      return c.json({ error: "Invalid locale" }, 400);
    }

    try {
      const sample = SAMPLES[templateParam] as Record<string, unknown>;
      const rendered = renderEmail(templateParam, localeParam, sample);
      return c.json(rendered);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  });

  return router;
}
