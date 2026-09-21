import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    getOrganizationSettings: vi.fn(),
    updateOrganizationSettings: vi.fn(),
  },
}));

describe("SettingsPage organization branding", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads existing organization settings into the form", async () => {
    vi.mocked(api.getOrganizationSettings).mockResolvedValue({
      company_name: "Acme Corp",
      support_email: "help@acme.example",
      support_phone: "+1 555 0100",
      logo_url: null,
      updated_at: null,
      updated_by: null,
    });

    render(<SettingsPage />);

    expect(await screen.findByDisplayValue("Acme Corp")).toBeTruthy();
    expect(screen.getByDisplayValue("help@acme.example")).toBeTruthy();
    expect(screen.getByDisplayValue("+1 555 0100")).toBeTruthy();
  });

  it("saves updated organization settings", async () => {
    vi.mocked(api.getOrganizationSettings).mockResolvedValue({
      company_name: "Old Name",
      support_email: null,
      support_phone: null,
      logo_url: null,
      updated_at: null,
      updated_by: null,
    });
    vi.mocked(api.updateOrganizationSettings).mockResolvedValue({
      company_name: "New Name",
      support_email: null,
      support_phone: null,
      logo_url: null,
      updated_at: "2026-01-01T00:00:00Z",
      updated_by: "admin-1",
    });

    render(<SettingsPage />);

    const nameInput = await screen.findByDisplayValue("Old Name");
    fireEvent.change(nameInput, { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() =>
      expect(api.updateOrganizationSettings).toHaveBeenCalledWith({
        company_name: "New Name",
        support_email: null,
        support_phone: null,
        logo_url: null,
      }),
    );
    expect(screen.getByText("Organization settings saved.")).toBeTruthy();
  });

  it("shows an error message when saving fails", async () => {
    vi.mocked(api.getOrganizationSettings).mockResolvedValue({
      company_name: "Old Name",
      support_email: null,
      support_phone: null,
      logo_url: null,
      updated_at: null,
      updated_by: null,
    });
    vi.mocked(api.updateOrganizationSettings).mockRejectedValue(new Error("403: Insufficient permissions"));

    render(<SettingsPage />);

    await screen.findByDisplayValue("Old Name");
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("You are not authorized to manage organization settings.")).toBeTruthy();
  });
});
