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
    console.error("Failed to link contact to user:", error);
  }
}
