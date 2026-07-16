import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import type { AdminUserRow, ApiError } from "$lib/api";

// ---------------------------------------------------------------------------
// Mock the typed API client. The panel must reach the network only through
// these helpers — never a raw fetch — so mocking the module fully isolates the
// component's behaviour. `isError` keeps the real semantics so the component's
// success/error branching is exercised faithfully.
// ---------------------------------------------------------------------------
const adminUsers = vi.fn();
const adminSetUserRole = vi.fn();
const adminUserResetLink = vi.fn();

vi.mock("$lib/api", () => ({
  adminUsers: (...a: unknown[]) => adminUsers(...a),
  adminSetUserRole: (...a: unknown[]) => adminSetUserRole(...a),
  adminUserResetLink: (...a: unknown[]) => adminUserResetLink(...a),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" && r !== null && "error" in r && typeof (r as ApiError).error === "string",
}));

// Import AFTER the mock is registered so the component binds to the mock.
import AdminUtilisateursTab from "../AdminUtilisateursTab.svelte";

const ME_ID = 1;

function user(over: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: 2,
    email: "marie@example.com",
    name: "Marie Tremblay",
    role: "guest",
    created_at: "2026-05-01T12:00:00.000Z",
    ...over,
  };
}

function renderTab(currentUserId = ME_ID) {
  return render(AdminUtilisateursTab, { props: { currentUserId } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Default: one other user.
  adminUsers.mockResolvedValue({ users: [user()] });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
});

describe("AdminUtilisateursTab", () => {
  it("renders the tabpanel root with correct ARIA", async () => {
    const { getByTestId } = renderTab();
    const root = getByTestId("admin-utilisateurs-tab");
    expect(root.getAttribute("role")).toBe("tabpanel");
    expect(root.getAttribute("aria-labelledby")).toBe("tab-utilisateurs");
  });

  it("fetches users on mount and renders a data row", async () => {
    const { getByTestId } = renderTab();
    await waitFor(() => expect(adminUsers).toHaveBeenCalledWith(undefined));
    await waitFor(() => getByTestId("users-row-2"));
    expect(getByTestId("users-cell-email-2").textContent).toContain("marie@example.com");
    expect(getByTestId("users-cell-name-2").textContent).toContain("Marie Tremblay");
  });

  it("renders '—' for a null name", async () => {
    adminUsers.mockResolvedValue({ users: [user({ name: null })] });
    const { getByTestId } = renderTab();
    await waitFor(() => getByTestId("users-cell-name-2"));
    expect(getByTestId("users-cell-name-2").textContent?.trim()).toBe("—");
  });

  it("shows the role badge with full French label", async () => {
    adminUsers.mockResolvedValue({ users: [user({ role: "admin" })] });
    const { getByTestId } = renderTab();
    const cell = await waitFor(() => getByTestId("users-cell-role-2"));
    const badge = cell.querySelector(".admin-utilisateurs-tab__badge");
    expect(badge?.textContent?.trim()).toBe("Administrateur");
    expect(badge?.getAttribute("aria-label")).toBe("Administrateur");
    expect(badge?.classList.contains("admin-utilisateurs-tab__badge--admin")).toBe(true);
  });

  it("hides action controls for the current user (self)", async () => {
    adminUsers.mockResolvedValue({ users: [user({ id: ME_ID })] });
    const { queryByTestId, getByTestId } = renderTab(ME_ID);
    await waitFor(() => getByTestId(`users-row-${ME_ID}`));
    expect(queryByTestId(`users-actions-stack-${ME_ID}`)).toBeNull();
    expect(queryByTestId(`users-role-btn-${ME_ID}`)).toBeNull();
  });

  it("shows the empty state when no users are returned", async () => {
    adminUsers.mockResolvedValue({ users: [] });
    const { getByTestId } = renderTab();
    await waitFor(() => getByTestId("users-empty"));
    expect(getByTestId("users-empty").getAttribute("role")).toBe("status");
  });

  it("shows a global error when the fetch fails", async () => {
    adminUsers.mockResolvedValue({ error: "boom" });
    const { getByTestId } = renderTab();
    const err = await waitFor(() => getByTestId("users-global-error"));
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain("Erreur lors du chargement");
  });

  it("debounces the search input and queries by email", async () => {
    const { getByTestId } = renderTab();
    await waitFor(() => expect(adminUsers).toHaveBeenCalledTimes(1));

    const input = getByTestId("users-search-input") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "marie" } });

    // Not called again until the debounce elapses.
    expect(adminUsers).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    await waitFor(() => expect(adminUsers).toHaveBeenCalledWith("marie"));
  });

  it("toggles a role and replaces the row with the server response", async () => {
    const promoted = user({ role: "admin" });
    adminSetUserRole.mockResolvedValue({ user: promoted });
    const { getByTestId } = renderTab();
    await waitFor(() => getByTestId("users-role-btn-2"));

    await fireEvent.click(getByTestId("users-role-btn-2"));
    await waitFor(() => expect(adminSetUserRole).toHaveBeenCalledWith(2, "admin"));
    await waitFor(() =>
      expect(getByTestId("users-cell-role-2").textContent).toContain("Administrateur"),
    );
  });

  it("shows a per-row error when the role change fails", async () => {
    adminSetUserRole.mockResolvedValue({ error: "Vous ne pouvez pas modifier votre propre rôle" });
    const { getByTestId } = renderTab();
    await waitFor(() => getByTestId("users-role-btn-2"));

    await fireEvent.click(getByTestId("users-role-btn-2"));
    const err = await waitFor(() => getByTestId("users-row-error-2"));
    expect(err.textContent).toContain("propre rôle");
  });

  it("generates a reset link and reveals it in a read-only chip", async () => {
    adminUserResetLink.mockResolvedValue({
      url: "https://site.test/reinitialisation?token=abc123",
    });
    const { getByTestId } = renderTab();
    await waitFor(() => getByTestId("users-link-btn-2"));

    await fireEvent.click(getByTestId("users-link-btn-2"));
    await waitFor(() => expect(adminUserResetLink).toHaveBeenCalledWith(2));

    const input = (await waitFor(() =>
      getByTestId("users-url-input-2"),
    )) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe("https://site.test/reinitialisation?token=abc123");
  });

  it("copies the reset link to the clipboard and updates the label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    adminUserResetLink.mockResolvedValue({ url: "https://site.test/reinitialisation?token=xyz" });

    const { getByTestId } = renderTab();
    await waitFor(() => getByTestId("users-link-btn-2"));
    await fireEvent.click(getByTestId("users-link-btn-2"));
    await waitFor(() => getByTestId("users-copy-btn-2"));

    await fireEvent.click(getByTestId("users-copy-btn-2"));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://site.test/reinitialisation?token=xyz"),
    );
    await waitFor(() =>
      expect(getByTestId("users-copy-label-2").textContent).toContain("Copié"),
    );
  });
});
