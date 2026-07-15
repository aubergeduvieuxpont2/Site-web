import type { Env } from "./env";

export interface NormalizedError {
  ok: false;
  status: number;
  message: string;
  retryAfterSeconds?: number;
}

export interface NormalizedSuccess {
  ok: true;
  data?: unknown;
}

export type NormalizedResponse = NormalizedSuccess | NormalizedError;

export function isTransientError(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export function isPermanentError(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

export function getRetryAfterSeconds(headers: Headers): number | undefined {
  const retryAfter = headers.get("Retry-After");
  if (!retryAfter) return undefined;
  const parsed = parseInt(retryAfter, 10);
  return isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function hubspotFetch(
  env: Env,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const url = `https://api.hubapi.com${path}`;
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${env.HUBSPOT_TOKEN}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(url, { ...init, headers });
  const contentType = response.headers.get("Content-Type");
  let body: unknown = null;

  if (contentType?.includes("application/json")) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const error: NormalizedError = {
      ok: false,
      status: response.status,
      message:
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof (body as any).message === "string"
          ? (body as any).message
          : `HubSpot API error: ${response.status}`,
    };
    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      error.retryAfterSeconds = getRetryAfterSeconds(response.headers);
    }
    throw error;
  }

  return body;
}
