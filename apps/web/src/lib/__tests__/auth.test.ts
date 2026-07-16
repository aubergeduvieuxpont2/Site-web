import { describe, it, expect, vi, beforeEach } from "vitest";
import { auth, setUser, clearUser, loadAuth } from "../auth.svelte";
import type { User } from "../api";

const guest: User = {
  id: 1,
  email: "guest@example.com",
  name: "Guest",
  role: "guest",
};

// Mock fetch used by getMe() inside loadAuth().
global.fetch = vi.fn();

describe("auth store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to a known logged-out, not-yet-loaded baseline.
    auth.user = null;
    auth.loaded = false;
  });

  describe("setUser", () => {
    it("stores the user and marks loaded", () => {
      setUser(guest);
      expect(auth.user).toEqual(guest);
      expect(auth.loaded).toBe(true);
    });

    it("accepts null to represent a logged-out but loaded state", () => {
      setUser(null);
      expect(auth.user).toBeNull();
      expect(auth.loaded).toBe(true);
    });
  });

  describe("clearUser", () => {
    it("resets the user to null and marks loaded", () => {
      setUser(guest);
      clearUser();
      expect(auth.user).toBeNull();
      expect(auth.loaded).toBe(true);
    });
  });

  describe("loadAuth", () => {
    it("sets the user on a successful /auth/me response", async () => {
      (global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify({ user: guest }), { status: 200 }),
      );

      await loadAuth();

      expect(auth.user).toEqual(guest);
      expect(auth.loaded).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/me",
        expect.objectContaining({ credentials: "include" }),
      );
    });

    it("clears the user on an API error response", async () => {
      setUser(guest);
      (global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
      );

      await loadAuth();

      expect(auth.user).toBeNull();
      expect(auth.loaded).toBe(true);
    });

    it("clears the user and does not throw on a network failure", async () => {
      setUser(guest);
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      await expect(loadAuth()).resolves.toBeUndefined();

      expect(auth.user).toBeNull();
      expect(auth.loaded).toBe(true);
    });

    it("never persists to localStorage", async () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      (global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify({ user: guest }), { status: 200 }),
      );

      await loadAuth();

      expect(setItem).not.toHaveBeenCalled();
      setItem.mockRestore();
    });
  });
});
