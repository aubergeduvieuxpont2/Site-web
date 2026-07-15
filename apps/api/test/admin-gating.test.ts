import { describe, it, expect, beforeEach, vi } from "vitest";
import { requireAuth, requireAdmin } from "../src/auth/middleware";
import type { Context } from "hono";

describe("auth middleware", () => {
  let mockContext: any;
  let nextCalled: boolean;

  beforeEach(() => {
    nextCalled = false;
    mockContext = {
      req: {
        header: vi.fn(),
      },
      json: vi.fn((data, status) => {
        mockContext.responseData = data;
        mockContext.responseStatus = status;
        return Promise.resolve();
      }),
      get: vi.fn(),
      user: undefined,
    };
  });

  describe("requireAuth", () => {
    it("denies request without session cookie", async () => {
      mockContext.req.header.mockReturnValue("");

      const next = vi.fn(() => {
        nextCalled = true;
        return Promise.resolve();
      });

      await requireAuth(mockContext, next);

      expect(mockContext.responseStatus).toBe(401);
      expect(mockContext.responseData.error).toBe("Unauthorized");
      expect(nextCalled).toBe(false);
    });

    it("allows request with valid session", async () => {
      const mockUser = {
        id: 1,
        email: "user@example.com",
        name: "Test User",
        role: "guest" as const,
      };

      const mockSql = vi.fn(() => Promise.resolve([mockUser]));
      mockContext.get.mockReturnValue(mockSql);
      mockContext.req.header.mockReturnValue("session=validtoken123");

      let nextCalled = false;
      const next = vi.fn(() => {
        nextCalled = true;
        return Promise.resolve();
      });

      await requireAuth(mockContext, next);

      expect(nextCalled).toBe(true);
      expect(mockContext.user).toEqual(mockUser);
    });

    it("denies request with invalid session", async () => {
      const mockSql = vi.fn(() => Promise.resolve([])); // No user found
      mockContext.get.mockReturnValue(mockSql);
      mockContext.req.header.mockReturnValue("session=invalidtoken");

      const next = vi.fn();

      await requireAuth(mockContext, next);

      expect(mockContext.responseStatus).toBe(401);
    });
  });

  describe("requireAdmin", () => {
    it("denies admin access to guest users", async () => {
      const guestUser = {
        id: 1,
        email: "guest@example.com",
        name: "Guest",
        role: "guest" as const,
      };

      const mockSql = vi.fn(() => Promise.resolve([guestUser]));
      mockContext.get.mockReturnValue(mockSql);
      mockContext.req.header.mockReturnValue("session=guesttoken");

      const next = vi.fn();

      await requireAdmin(mockContext, next);

      expect(mockContext.responseStatus).toBe(403);
      expect(mockContext.responseData.error).toBe("Forbidden");
    });

    it("allows admin access to admin users", async () => {
      const adminUser = {
        id: 2,
        email: "admin@example.com",
        name: "Admin",
        role: "admin" as const,
      };

      const mockSql = vi.fn(() => Promise.resolve([adminUser]));
      mockContext.get.mockReturnValue(mockSql);
      mockContext.req.header.mockReturnValue("session=admintoken");

      const next = vi.fn(() => Promise.resolve());

      await requireAdmin(mockContext, next);

      expect(mockContext.user).toEqual(adminUser);
      expect(next).toHaveBeenCalled();
    });

    it("denies admin access when no session present", async () => {
      mockContext.req.header.mockReturnValue("");

      const next = vi.fn();

      await requireAdmin(mockContext, next);

      expect(mockContext.responseStatus).toBe(401);
    });

    it("denies admin access when session is invalid", async () => {
      const mockSql = vi.fn(() => Promise.resolve([])); // No user found
      mockContext.get.mockReturnValue(mockSql);
      mockContext.req.header.mockReturnValue("session=invalidtoken");

      const next = vi.fn();

      await requireAdmin(mockContext, next);

      expect(mockContext.responseStatus).toBe(401);
    });
  });
});
