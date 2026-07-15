import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSession, validateSession, deleteSession } from "../src/auth/session";
import type { Sql } from "@neondatabase/serverless";

describe("session management", () => {
  let mockSql: Sql;

  beforeEach(() => {
    mockSql = vi.fn() as any;
  });

  it("creates a session with a token", async () => {
    const userId = 123;

    mockSql.mockImplementation((strings: any) => {
      if (strings[0]?.includes("INSERT INTO sessions")) {
        return Promise.resolve([{ token_hash: "hash" }]);
      }
      return Promise.resolve([]);
    });

    const token = await createSession(mockSql, userId, 30);

    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(0);
    expect(typeof token).toBe("string");
  });

  it("validates a session with a valid token", async () => {
    const mockUser = {
      id: 123,
      email: "user@example.com",
      name: "Test User",
      role: "guest" as const,
    };

    mockSql.mockImplementation((strings: any) => {
      if (strings[0]?.includes("SELECT u.id")) {
        return Promise.resolve([mockUser]);
      }
      return Promise.resolve([]);
    });

    const token = "mocktoken";
    const user = await validateSession(mockSql, token);

    expect(user).toBeTruthy();
    expect(user?.id).toBe(123);
    expect(user?.email).toBe("user@example.com");
    expect(user?.role).toBe("guest");
  });

  it("rejects an expired session", async () => {
    mockSql.mockImplementation(() => {
      return Promise.resolve([]);
    });

    const token = "expiredtoken";
    const user = await validateSession(mockSql, token);

    expect(user).toBeNull();
  });

  it("rejects an unknown token", async () => {
    mockSql.mockImplementation(() => {
      return Promise.resolve([]);
    });

    const token = "unknowntoken";
    const user = await validateSession(mockSql, token);

    expect(user).toBeNull();
  });

  it("deletes a session", async () => {
    let deleteCalled = false;

    mockSql.mockImplementation((strings: any) => {
      if (strings[0]?.includes("DELETE FROM sessions")) {
        deleteCalled = true;
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const token = "tokentodeletetoken";
    await deleteSession(mockSql, token);

    expect(deleteCalled).toBe(true);
  });
});
