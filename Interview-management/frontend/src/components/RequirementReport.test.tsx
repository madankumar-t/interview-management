import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequirementReport } from "./RequirementReport";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    getRequirementOverview: vi.fn(),
  },
}));

describe("RequirementReport", () => {
  beforeEach(() => {
    vi.mocked(api.getRequirementOverview).mockResolvedValue({
      generated_at: "2026-09-09T00:00:00+00:00",
      timezone: "Asia/Kolkata",
      summary: {
        total_requirements: 1,
        open_requirements: 1,
        open_positions: 3,
        clients: 1,
        today_interviews: 0,
        upcoming_interviews: 2,
        pending_feedback: 1,
      },
      filters: {
        requisitions: ["REQ-001"],
        clients: ["Contoso"],
        statuses: ["Interviewing"],
      },
      requirements: [
        {
          requisition_id: "REQ-001",
          title: "Backend Engineer",
          department: "Engineering",
          project: "Core",
          status: "Interviewing",
          intake_received_at_utc: "2026-09-01T00:00:00Z",
          positions_total: 4,
          positions_filled: 1,
          positions_open: 3,
          client_name: "Contoso",
          interviews_total: 2,
          scheduled: 1,
          in_progress: 0,
          completed: 1,
          cancelled: 0,
          no_show: 0,
          pending_feedback: 1,
        },
      ],
    });
  });

  it("loads open requirement metrics and filter options", async () => {
    render(<RequirementReport />);

    await waitFor(() => expect(screen.getAllByText("REQ-001").length).toBeGreaterThan(0));
    expect(screen.getByText("Backend Engineer")).not.toBeNull();
    expect(screen.getByRole("option", { name: "Contoso" })).not.toBeNull();
    expect(api.getRequirementOverview).toHaveBeenCalledWith({
      requisitionId: "",
      clientName: "",
      status: "",
      openOnly: true,
    });
  });
});
