import { describe, it, expect, beforeEach, vi } from "vitest";

// Capture every tagged-template SQL call so we can assert on the claim query
// (H5: atomic claim + lease + reaper). `neon(conn)` returns a tagged-template
// function; our mock records the query text/values and returns a canned result.
const hoisted = vi.hoisted(() => {
  const calls: Array<{ text: string; values: any[] }> = [];
  let nextRows: any[] = [];
  const tag = (strings: TemplateStringsArray, ...values: any[]) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(nextRows);
  };
  return {
    calls,
    tag,
    setRows: (rows: any[]) => {
      nextRows = rows;
    },
  };
});

vi.mock("@neondatabase/serverless", () => ({
  neon: () => hoisted.tag,
}));

import { claimBatch, CLAIM_LEASE_SECONDS } from "../src/outbox";
import type { Env } from "../src/env";

const mockEnv: Env = { HUBSPOT_TOKEN: "t", DB_CONN: "postgres://test" };

describe("claimBatch — atomic claim, lease, reaper (H5)", () => {
  beforeEach(() => {
    hoisted.calls.length = 0;
    hoisted.setRows([]);
  });

  it("claims by flipping status to 'processing' and advancing next_attempt_at by the lease", async () => {
    await claimBatch(mockEnv, 10);
    expect(hoisted.calls).toHaveLength(1);
    const q = hoisted.calls[0].text;

    // The claiming UPDATE takes the row out of the claimable set atomically.
    expect(q).toContain("status = 'processing'");
    expect(q).toContain("next_attempt_at = now() +");
    expect(q).toContain("interval '1 second'");
    expect(q).toContain("attempts = attempts + 1");
    expect(q).toContain("FOR UPDATE SKIP LOCKED");

    // Lease seconds and limit are passed as bound values.
    expect(hoisted.calls[0].values).toContain(CLAIM_LEASE_SECONDS);
    expect(hoisted.calls[0].values).toContain(10);
  });

  it("reaper: selection treats expired 'processing' rows as claimable", async () => {
    // An expired in-flight row (a drain that died) is re-claimed.
    hoisted.setRows([{ id: "7", status: "processing", attempts: 2 }]);

    const rows = await claimBatch(mockEnv, 25);

    const q = hoisted.calls[0].text;
    expect(q).toContain("status IN ('pending', 'processing')");
    expect(q).toContain("next_attempt_at <= now()");
    expect(rows).toEqual([{ id: "7", status: "processing", attempts: 2 }]);
  });
});
