import { neon } from "@neondatabase/serverless";

export async function linkContactToUser(
  env: any,
  email: string,
  hubspotId: string
): Promise<void> {
  try {
    const sql = neon(env.DB_CONN);
    await sql`
      UPDATE users
      SET hubspot_contact_id = ${hubspotId}
      WHERE lower(email) = lower(${email})
    `;
  } catch (error) {
    // Log a stable, PII-free marker only. The raw error can embed the guest's
    // email/name (query params, driver messages), which must not reach logs.
    const code =
      error instanceof Error && error.name ? error.name : "UnknownError";
    console.error(`linkContactToUser failed (hubspotId=${hubspotId}): ${code}`);
  }
}
