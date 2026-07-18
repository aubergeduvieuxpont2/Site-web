export type Env = {
  API: Fetcher;
  FORWARD_TO: string;
  // Shared secret attached (as X-Internal-Auth) on every internal POST to the
  // API Worker. Unset means the API will reject the call (fail-closed).
  INTERNAL_OTA_SECRET?: string;
};
