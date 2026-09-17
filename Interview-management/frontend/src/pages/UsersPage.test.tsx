import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UsersPage } from "./UsersPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    listAdminUsers: vi.fn(),
    resetAdminUserPassword: vi.fn(),
  },
}));

describe("UsersPage password reset", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lets an administrator request a reset for an active user", async () => {
    vi.mocked(api.listAdminUsers).mockResolvedValue([
      {
        sub: "user-1",
        email: "user@example.com",
        full_name: "Example User",
        groups: ["Panel"],
        status: "ACTIVE",
        authz_version: 1,
      },
    ]);
    vi.mocked(api.resetAdminUserPassword).mockResolvedValue({
      sub: "user-1",
      message: "Password reset requested",
    });

    render(<UsersPage />);

    const resetButton = await screen.findByRole("button", { name: "Reset Password" });
    fireEvent.click(resetButton);

    await waitFor(() => expect(api.resetAdminUserPassword).toHaveBeenCalledWith("user-1"));
    expect(screen.getByText("Password reset instructions sent to user@example.com.")).toBeTruthy();
  });
});
