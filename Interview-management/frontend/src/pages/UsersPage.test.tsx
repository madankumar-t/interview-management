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

  it("shows the Cognito reason when a password reset fails", async () => {
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
    vi.mocked(api.resetAdminUserPassword).mockRejectedValue(
      new Error('400: {"detail":"Cannot reset password because email delivery is not configured"}'),
    );

    render(<UsersPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Reset Password" }));

    expect(await screen.findByText("Password reset failed: Cannot reset password because email delivery is not configured")).toBeTruthy();
  });

  it("disables reset password for federated users", async () => {
    vi.mocked(api.listAdminUsers).mockResolvedValue([
      {
        sub: "user-2",
        email: "user@example.com",
        full_name: "Example User",
        groups: ["Panel"],
        status: "ACTIVE",
        authz_version: 1,
        cognito_status: "EXTERNAL_PROVIDER",
        password_reset_allowed: false,
        password_reset_block_reason: "Federated sign-in users must reset their password with their identity provider",
      },
    ]);

    render(<UsersPage />);

    const resetButton = await screen.findByRole("button", { name: "Reset Password" });
    expect(resetButton.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("This user signs in with an external identity provider.")).toBeTruthy();
    expect(api.resetAdminUserPassword).not.toHaveBeenCalled();
  });
});
