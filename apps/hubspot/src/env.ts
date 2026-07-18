export type Env = {
  HUBSPOT_TOKEN: string;
  DB_CONN: string;
  // Shared secret required on every inbound /ops/* request (X-Internal-Auth).
  GATEWAY_AUTH_SECRET?: string;
  HUBSPOT_PIPELINE_ID?: string;
  HUBSPOT_DEALSTAGE_ID?: string;
  HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID?: string;
};
