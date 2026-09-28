import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FeedbackOverviewPage } from "./FeedbackOverviewPage";
import { api } from "../lib/api";
import type { UserSession } from "../types/auth";

vi.mock("../lib/api", () => ({
  api: {
    listInterviews: vi.fn(),
    getFeedbackForInterview: vi.fn(),
  },
}));

const managerSession: UserSession = {
  sub: "manager-1",
  email: "manager@example.com",
  groups: ["Manager"],
  accessToken: "token",
};

const taSession: UserSession = {
  sub: "ta-1",
  email: "ta@example.com",
  groups: ["TA"],
  accessToken: "token",
};

const panelSession: UserSession = {
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
  round_name: "L1",
  interview_type: "Technical",
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
};

describe("FeedbackOverviewPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows submitted panel feedback across rounds, including rejected interviews", async () => {
    vi.mocked(api.listInterviews).mockResolvedValue({
      interviews: [
        { ...interview, interview_id: "l1", status: "Completed", candidate_name: "Richa" },
        { ...interview, interview_id: "client", status: "Rejected", round_name: "Client", interview_type: "Client Interview", candidate_name: "Richa" },
      ],
    });
    vi.mocked(api.getFeedbackForInterview)
      .mockResolvedValueOnce([{
        interview_id: "l1",
        competency_scores: { Technical: 4 },
        strengths: "Strong fundamentals",
        improvement_areas: "Communication",
        recommendation: "Hire",
        comments: "Proceed to next round",
        author_sub: "panel-1",
        status: "Submitted",
      }])
      .mockResolvedValueOnce([{
        interview_id: "client",
        competency_scores: { Communication: 2 },
        strengths: "Clear experience",
        improvement_areas: "Role alignment",
        recommendation: "No Hire",
        comments: "Client declined",
        author_sub: "panel-2",
        status: "Submitted",
      }]);

    render(<MemoryRouter><FeedbackOverviewPage session={managerSession} /></MemoryRouter>);

    await waitFor(() => expect(screen.getAllByText("Richa")).toHaveLength(2));
    expect(screen.getAllByText("Rejected")).toHaveLength(2);
    expect(screen.getByText("Client round")).toBeTruthy();
    fireEvent.click(screen.getAllByText(/View 1 evaluation/)[0]);
    expect(await screen.findByText("Panel evaluation 1: Hire")).toBeTruthy();
    expect(screen.getByText("Proceed to next round")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "Filter by round" }), { target: { value: "Client" } });
    expect(screen.getAllByText("Richa")).toHaveLength(1);
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  it("does not show drafts as submitted panel evaluations", async () => {
    vi.mocked(api.listInterviews).mockResolvedValue({
      interviews: [{ ...interview, interview_id: "l1", status: "Completed", candidate_name: "Sam" }],
    });
    vi.mocked(api.getFeedbackForInterview).mockResolvedValue([{
      interview_id: "l1",
      competency_scores: {},
      strengths: "Draft note",
      improvement_areas: "",
      recommendation: "Hire",
      comments: "",
      author_sub: "panel-1",
      status: "Draft",
    }]);

    render(<MemoryRouter><FeedbackOverviewPage session={managerSession} /></MemoryRouter>);

    expect(await screen.findByText("No submitted feedback")).toBeTruthy();
    expect(screen.queryByText("Draft note")).toBeNull();
  });

  it("lets coordinators export every round regardless of active filters", async () => {
    let downloadBlob: { parts: BlobPart[] } | undefined;
    vi.stubGlobal("Blob", class {
      parts: BlobPart[];

      constructor(parts: BlobPart[]) {
        this.parts = parts;
      }
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: { parts: BlobPart[] }) => {
        downloadBlob = blob;
        return "blob:feedback-export";
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.mocked(api.listInterviews).mockResolvedValue({
      interviews: [
        { ...interview, interview_id: "l1", status: "L1 Completed", candidate_name: "Richa" },
        { ...interview, interview_id: "l2", status: "L2 Scheduled", round_name: "L2", candidate_name: "Richa" },
        { ...interview, interview_id: "sam", status: "Completed", candidate_id: "candidate-2", candidate_name: "Sam" },
      ],
    });
    vi.mocked(api.getFeedbackForInterview)
      .mockResolvedValueOnce([{
        interview_id: "l1",
        competency_scores: { Technical: 4 },
        strengths: "Strong fundamentals",
        improvement_areas: "Communication",
        recommendation: "Hire",
        comments: "Proceed",
        author_sub: "panel-1",
        status: "Submitted",
      }])
      .mockResolvedValueOnce([{
        interview_id: "l2",
        competency_scores: { Technical: 5 },
        strengths: "Strong L2 system design",
        improvement_areas: "None noted",
        recommendation: "Strong Hire",
        comments: "Proceed to final round",
        author_sub: "panel-2",
        status: "Submitted",
      }])
      .mockResolvedValueOnce([]);
    render(<MemoryRouter><FeedbackOverviewPage session={managerSession} /></MemoryRouter>);
    await screen.findByText("Sam");
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select feedback for Richa" })[0]);
    expect(screen.getByRole("region", { name: "Selected candidates report preview" })).toBeTruthy();
    expect(screen.getByText(/L2 · L2 Scheduled/)).toBeTruthy();
    expect(screen.getByText("Strong L2 system design")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Download Selected CSV" }).hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by round" }), { target: { value: "L1" } });
    fireEvent.click(screen.getByRole("button", { name: "Download Selected CSV" }));

    await waitFor(() => expect(downloadBlob).toBeTruthy());
    const csv = downloadBlob!.parts[0] as string;
    expect(csv).toContain('"Round"');
    expect(csv).toContain('"Richa","Acme","Software Engineer","L1"');
    expect(csv).toContain('"Richa","Acme","Software Engineer","L2"');
    expect(csv).not.toContain("Sam");
  });

  it("downloads a PDF report for all rounds regardless of active filters", async () => {
    let downloadBlob: Blob | undefined;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        downloadBlob = blob;
        return "blob:feedback-pdf";
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.mocked(api.listInterviews).mockResolvedValue({
      interviews: [
        { ...interview, interview_id: "l1", status: "L1 Completed", candidate_name: "Richa" },
        { ...interview, interview_id: "l2", status: "L2 Scheduled", round_name: "L2", candidate_name: "Richa" },
        { ...interview, interview_id: "sam", status: "Completed", candidate_id: "candidate-2", candidate_name: "Sam" },
      ],
    });
    vi.mocked(api.getFeedbackForInterview)
      .mockResolvedValueOnce([{
        interview_id: "l1",
        competency_scores: { Technical: 4 },
        strengths: "Strong fundamentals",
        improvement_areas: "Communication",
        recommendation: "Hire",
        comments: "Proceed",
        author_sub: "panel-1",
        status: "Submitted",
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    render(<MemoryRouter><FeedbackOverviewPage session={managerSession} /></MemoryRouter>);
    await screen.findByText("Sam");
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select feedback for Richa" })[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Download Selected PDF" }).hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by round" }), { target: { value: "L1" } });
    fireEvent.click(screen.getByRole("button", { name: "Download Selected PDF" }));

    await waitFor(() => expect(downloadBlob?.type).toBe("application/pdf"));
    expect(downloadBlob?.size).toBeGreaterThan(0);
  });

  it("allows TA users to select a candidate and download their feedback", async () => {
    vi.mocked(api.listInterviews).mockResolvedValue({
      interviews: [{ ...interview, interview_id: "ta-candidate-round", status: "L1 Completed", candidate_name: "Richa" }],
    });
    vi.mocked(api.getFeedbackForInterview).mockResolvedValue([{
      interview_id: "ta-candidate-round",
      competency_scores: { Technical: 4 },
      strengths: "Strong fundamentals",
      improvement_areas: "Communication",
      recommendation: "Hire",
      comments: "Proceed",
      author_sub: "panel-1",
      status: "Submitted",
    }]);

    render(<MemoryRouter><FeedbackOverviewPage session={taSession} /></MemoryRouter>);

    await screen.findByText("Richa");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select feedback for Richa" }));

    expect(screen.getByRole("button", { name: "Download Selected CSV" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Download Selected PDF" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getAllByText("Panel evaluation 1: Hire")).toHaveLength(2);
  });

  it("shows Panel users only their completed or rejected interviews", async () => {
    vi.mocked(api.listInterviews).mockResolvedValue({
      interviews: [
        { ...interview, interview_id: "scheduled", status: "L1 Scheduled", candidate_name: "Upcoming Candidate" },
        { ...interview, interview_id: "completed", status: "L1 Completed", candidate_name: "Interviewed Candidate" },
        { ...interview, interview_id: "rejected", status: "Rejected", candidate_name: "Rejected Candidate" },
        { ...interview, interview_id: "cancelled", status: "Cancelled", candidate_name: "Cancelled Candidate" },
      ],
    });
    vi.mocked(api.getFeedbackForInterview).mockResolvedValue([]);

    render(<MemoryRouter><FeedbackOverviewPage session={panelSession} /></MemoryRouter>);

    expect(await screen.findByText("Interviewed Candidate")).toBeTruthy();
    expect(screen.getByText("Rejected Candidate")).toBeTruthy();
    expect(screen.queryByText("Upcoming Candidate")).toBeNull();
    expect(screen.queryByText("Cancelled Candidate")).toBeNull();
    expect(api.listInterviews).toHaveBeenCalledWith({ mineOnly: true });
    await waitFor(() => expect(api.getFeedbackForInterview).toHaveBeenCalledTimes(2));
    expect(api.getFeedbackForInterview).toHaveBeenCalledWith("completed");
    expect(api.getFeedbackForInterview).toHaveBeenCalledWith("rejected");
  });
});