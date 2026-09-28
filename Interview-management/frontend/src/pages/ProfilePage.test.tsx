import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfilePage } from "./ProfilePage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: {
  getMyProfile: vi.fn(), getMyProfilePhoto: vi.fn(), updateMyProfile: vi.fn(),
  uploadMyProfilePhoto: vi.fn(), deleteMyProfilePhoto: vi.fn(),
} }));

describe("ProfilePage", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it("updates the signed-in panel member's name and photo", async () => {
    vi.stubGlobal("URL", Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:profile"), revokeObjectURL: vi.fn(),
    }));
    vi.mocked(api.getMyProfile).mockResolvedValue({ display_name: "", email: "panel@example.com", has_photo: false });
    vi.mocked(api.updateMyProfile).mockResolvedValue({ display_name: "Panel Member", email: "panel@example.com", has_photo: false });
    vi.mocked(api.uploadMyProfilePhoto).mockResolvedValue();
    vi.mocked(api.deleteMyProfilePhoto).mockResolvedValue();
    const updated = vi.fn();
    window.addEventListener("ims-profile-updated", updated);
    try {
      render(<ProfilePage session={{ sub: "panel-1", email: "panel@example.com", groups: ["Panel"], accessToken: "token" }} />);
      const input = await screen.findByLabelText("Display name") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Panel Member" } });
      fireEvent.click(screen.getByRole("button", { name: "Save name" }));
      await waitFor(() => expect(api.updateMyProfile).toHaveBeenCalledWith("Panel Member"));
      expect(await screen.findByText("Display name saved.")).toBeTruthy();

      const photo = new File(["\x89PNG\r\n\x1a\n"], "photo.png", { type: "image/png" });
      fireEvent.change(screen.getByLabelText("Profile photo"), { target: { files: [photo] } });
      await waitFor(() => expect(api.uploadMyProfilePhoto).toHaveBeenCalledWith(photo));
      fireEvent.click(await screen.findByRole("button", { name: "Remove photo" }));
      await waitFor(() => expect(api.deleteMyProfilePhoto).toHaveBeenCalledOnce());
      expect(updated).toHaveBeenCalledTimes(3);
      expect(screen.getByText("panel@example.com")).toBeTruthy();
      expect(screen.getByText("Panel")).toBeTruthy();
    } finally {
      window.removeEventListener("ims-profile-updated", updated);
    }
  });
});