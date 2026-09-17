import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MyAvailabilityPage } from "./MyAvailabilityPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    getMyAvailability: vi.fn(),
    updateMyAvailability: vi.fn(),
  },
}));

describe("MyAvailabilityPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads and saves the panel member's availability", async () => {
    vi.mocked(api.getMyAvailability).mockResolvedValue({
      sub: "panel-a",
      availability: [
        {
          start_utc: "2026-09-20T04:30:00.000Z",
          end_utc: "2026-09-20T06:30:00.000Z",
          timezone: "Asia/Kolkata",
        },
      ],
    });
    vi.mocked(api.updateMyAvailability).mockResolvedValue({
      sub: "panel-a",
      availability: [],
    });

    render(<MyAvailabilityPage />);

    await waitFor(() => expect(screen.getByDisplayValue("2026-09-20")).toBeTruthy());
    expect(screen.getByDisplayValue("10:00")).toBeTruthy();
    expect(screen.getByDisplayValue("12:00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save Availability" }));

    await waitFor(() =>
      expect(api.updateMyAvailability).toHaveBeenCalledWith([
        {
          start_utc: "2026-09-20T04:30:00.000Z",
          end_utc: "2026-09-20T06:30:00.000Z",
          timezone: "Asia/Kolkata",
        },
      ]),
    );
    expect(screen.getByText(/TA schedulers can now use these time windows/)).toBeTruthy();
  });
});
