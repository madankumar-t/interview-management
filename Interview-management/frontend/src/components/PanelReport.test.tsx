import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PanelReport } from "./PanelReport";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    getPanelReport: vi.fn(),
  },
}));

const report = {
  generated_at: "2026-09-17T12:00:00Z",
  summary: {
    Internal: { panels: 1, interviews: 3, completed: 2, pending_feedback: 1 },
    External: { panels: 1, interviews: 2, completed: 1, pending_feedback: 1 },
  },
  panels: [
    {
      panel_id: "p-1",
      sub: "internal-1",
      full_name: "Internal Interviewer",
      email: "internal@example.com",
      panel_type: "Internal" as const,
      status: "Active",
      availability_slots: 2,
      interviews_total: 3,
      scheduled: 1,
      in_progress: 0,
      completed: 2,
      cancelled: 0,
      no_show: 0,
      pending_feedback: 1,
    },
    {
      panel_id: "p-2",
      sub: "external-1",
      full_name: "External Interviewer",
      email: "external@example.com",
      panel_type: "External" as const,
      status: "Active",
      availability_slots: 1,
      interviews_total: 2,
      scheduled: 1,
      in_progress: 0,
      completed: 1,
      cancelled: 0,
      no_show: 0,
      pending_feedback: 1,
    },
  ],
};

describe("PanelReport", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows internal/external summaries and filters the panel report", async () => {
    vi.mocked(api.getPanelReport).mockResolvedValue(report);
    render(<PanelReport />);

    await waitFor(() => expect(screen.getByText("Internal Interviewer")).toBeTruthy());
    expect(screen.getByText("External Interviewer")).toBeTruthy();
    expect(screen.getByText("Internal Panels")).toBeTruthy();
    expect(screen.getByText("External Panels")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Panel type"), { target: { value: "External" } });
    await waitFor(() => expect(api.getPanelReport).toHaveBeenLastCalledWith("External"));
  });
});
