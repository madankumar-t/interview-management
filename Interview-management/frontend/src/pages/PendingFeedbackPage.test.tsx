import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PendingFeedbackPage } from "./PendingFeedbackPage";
import { api } from "../lib/api";
import type { UserSession } from "../types/auth";

vi.mock("../lib/api", () => ({
  api: {
    listInterviews: vi.fn(),
    getFeedbackForInterview: vi.fn(),
  },
}));

const session: UserSession = {
  sub: "panel-1",
  email: "panel@example.com",
  groups: ["Panel"],
  accessToken: "token",
};

const interview = {
  candidate_id: "candidate-1",
  requisition_id: "REQ-1",
  department: "Engineering",
  project: "Core",
  panel_subs: ["panel-1"],
  lead_panel_sub: "panel-1",
  round_name: "Technical",
  interview_type: "Video",
  mode: "Online",
  meeting_url: null,
  venue: null,
  instructions: null,
  start_utc: "2026-09-17T10:00:00+00:00",
  end_utc: "2026-09-17T11:00:00+00:00",
  timezone: "Asia/Kolkata",
  version: 1,
  requisition_title: "Software Engineer",
  client_name: "Acme",
  candidate_name: "Candidate One",
};

describe("PendingFeedbackPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists scheduled and completed assignments and excludes other statuses", async () => {
    vi.mocked(api.listInterviews).mockResolvedValue({
      interviews: [
        { ...interview, interview_id: "scheduled-1", status: "Scheduled" },
        { ...interview, interview_id: "completed-1", status: "Completed", candidate_name: "Candidate Two" },
        { ...interview, interview_id: "cancelled-1", status: "Cancelled", candidate_name: "Candidate Three" },
      ],
    });
    vi.mocked(api.getFeedbackForInterview)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          interview_id: "completed-1",
          competency_scores: { Technical: 4 },
          strengths: "Strong",
          improvement_areas: "Communication",
          recommendation: "Hire",
          comments: "",
          author_sub: "panel-1",
          status: "Draft",
        },
      ]);

    render(
      <MemoryRouter>
        <PendingFeedbackPage session={session} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Candidate One")).toBeTruthy());
    expect(screen.getByText("Candidate Two")).toBeTruthy();
    expect(screen.queryByText("Candidate Three")).toBeNull();
    expect(screen.getByRole("link", { name: "Provide Feedback" }).getAttribute("href")).toBe(
      "/interviews/scheduled-1/feedback",
    );
    expect(screen.getByRole("link", { name: "Continue Draft" }).getAttribute("href")).toBe(
      "/interviews/completed-1/feedback",
    );
  });
});
