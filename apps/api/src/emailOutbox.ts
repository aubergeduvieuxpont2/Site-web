import { neon } from "@neondatabase/serverless";
import { renderEmail } from "./emails/render";
import type { TemplateKey } from "./emails/templates";
import { contactContext } from "./emails/routes";

export const EMAIL_FROM = "Auberge du Vieux Pont <no-reply@aubergeduvieuxpont.ca>";

export const EMAIL_TOGGLE_KEYS: Record<string, string> = {
  "reservation-confirmation": "email_confirmation_enabled",
  "password-reset": "email_password_reset_enabled",
  "room-assigned": "email_room_assignment_enabled",
  "ota-welcome": "email_welcome_enabled",
};

export type EmailTemplate = TemplateKey;

export function computeEmailBackoff(attempts: number): number {
  return Math.min(3600, 30 * Math.pow(2, attempts - 1));
}

export function isTransientResendFailure(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export async function enqueueEmail(
  sql: (...args: any[]) => any,
  input: {
    template: EmailTemplate;
    to: string;
    locale?: "fr" | "en";
    payload: Record<string, unknown>;
  }
): Promise<{ enqueued: boolean }> {
  const { template, to, locale = "fr", payload } = input;
  const toggleKey = EMAIL_TOGGLE_KEYS[template];
  if (!toggleKey) return { enqueued: false };

  const rows = await sql`SELECT value FROM settings WHERE key = ${toggleKey}`;
  const enabled = rows[0]?.value === "true";
  if (!enabled) return { enqueued: false };

  await sql`
    INSERT INTO email_outbox (to_email, template, locale, payload)
    VALUES (${to}, ${template}, ${locale}, ${JSON.stringify(payload)}::jsonb)
  `;

  return { enqueued: true };
}

export async function drainEmailOutbox(
  env: { DB_CONN: string; RESEND_API_KEY: string }
): Promise<{ delivered: number; retried: number; failed: number }> {
  let delivered = 0;
  let retried = 0;
  let failed = 0;

  try {
    const sql = neon(env.DB_CONN);

    const rows = (await sql`
      SELECT id, to_email, template, locale, payload, attempts
      FROM email_outbox
      WHERE status = 'pending' AND next_attempt_at <= now()
      ORDER BY next_attempt_at
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    `) as {
      id: number;
      to_email: string;
      template: string;
      locale: string;
      payload: Record<string, unknown>;
      attempts: number;
    }[];

    const contact = await contactContext(env.DB_CONN);

    for (const row of rows) {
      try {
        const rendered = renderEmail(
          row.template as EmailTemplate,
          row.locale as "fr" | "en",
          { ...row.payload, ...contact }
        );

        let res: Response;
        try {
          res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: EMAIL_FROM,
              to: [row.to_email],
              subject: rendered.subject,
              html: rendered.html,
              text: rendered.text,
            }),
          });
        } catch (networkErr) {
          const msg = networkErr instanceof Error ? networkErr.message : "Network error";
          try {
            const newAttempts = row.attempts + 1;
            const backoffSecs = computeEmailBackoff(newAttempts);
            await sql`
              UPDATE email_outbox
              SET attempts = ${newAttempts},
                  next_attempt_at = now() + (${backoffSecs.toString()} || ' seconds')::interval,
                  last_error = ${msg},
                  updated_at = now()
              WHERE id = ${row.id}
            `;
          } catch {}
          retried++;
          continue;
        }

        if (res.status === 200 || res.status === 201) {
          let providerId: string | null = null;
          try {
            const body = (await res.json()) as { id?: string };
            providerId = body.id ?? null;
          } catch {}
          await sql`
            UPDATE email_outbox
            SET status = 'delivered',
                provider_id = ${providerId},
                updated_at = now()
            WHERE id = ${row.id}
          `;
          delivered++;
        } else if (isTransientResendFailure(res.status)) {
          const newAttempts = row.attempts + 1;
          const backoffSecs = computeEmailBackoff(newAttempts);
          await sql`
            UPDATE email_outbox
            SET attempts = ${newAttempts},
                next_attempt_at = now() + (${backoffSecs.toString()} || ' seconds')::interval,
                last_error = ${"HTTP " + res.status},
                updated_at = now()
            WHERE id = ${row.id}
          `;
          retried++;
        } else {
          let body = "";
          try {
            body = await res.text();
          } catch {}
          await sql`
            UPDATE email_outbox
            SET status = 'failed',
                last_error = ${"HTTP " + res.status + ": " + body.slice(0, 500)},
                updated_at = now()
            WHERE id = ${row.id}
          `;
          failed++;
        }
      } catch (rowErr) {
        const msg = rowErr instanceof Error ? rowErr.message : "Unknown error";
        try {
          await sql`
            UPDATE email_outbox
            SET status = 'failed',
                last_error = ${msg},
                updated_at = now()
            WHERE id = ${row.id}
          `;
        } catch {}
        failed++;
      }
    }
  } catch {
    // DB connection or query failure — resolve without throwing
  }

  return { delivered, retried, failed };
}
