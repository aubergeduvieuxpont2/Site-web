export type Env = {
  API: Fetcher;
  FORWARD_TO: string;
  // Operator address whose forwarded OTA emails are processed (provider
  // inferred from subject) but never forwarded to FORWARD_TO.
  DEV_SENDER?: string;
};
