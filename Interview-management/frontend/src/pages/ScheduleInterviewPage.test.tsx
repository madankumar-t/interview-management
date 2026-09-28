import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ScheduleInterviewPage } from "./ScheduleInterviewPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: { getAvailableSlots: vi.fn(), checkConflicts: vi.fn(), scheduleInterview: vi.fn() } }));
vi.mock("../components/SearchSelect", () => ({ SearchSelect: ({ label, onChange }: { label: string; onChange: (value: unknown) => void }) => (
  <button type="button" onClick={() => onChange(label === "Candidate" ? {
    candidate_id: "candidate-1", full_name: "Candidate One", email: "candidate@example.com",
  } : label === "Requirement" ? {
    requisition_id: "REQ-1", title: "Engineer", client_name: "Acme",
  } : "Asia/Kolkata")}>{label}</button>
) }));
vi.mock("../components/MultiSearchSelect", () => ({ MultiSearchSelect: ({ onChange }: { onChange: (value: unknown) => void }) => (
  <button type="button" onClick={() => onChange([{
    sub: "panel-1", full_name: "Panel One", email: "panel@example.com",
  }])}>Choose panel</button>
) }));
vi.mock("../components/TagInput", () => ({ TagInput: () => null }));

describe("ScheduleInterviewPage available slots", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("offers a shared slot and blocks submission until review verification succeeds", async () => {
    vi.mocked(api.getAvailableSlots).mockResolvedValue({ slots: [{
      start_utc: "2030-09-27T03:30:00+00:00", end_utc: "2030-09-27T04:30:00+00:00",
    }] });
    vi.mocked(api.checkConflicts).mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ conflicts: [], unavailable_panel_subs: [] });

    render(<MemoryRouter><ScheduleInterviewPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Candidate" }));
    fireEvent.click(screen.getByRole("button", { name: "Requirement" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose panel" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Lead interviewer" }), { target: { value: "panel-1" } });
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Interview Status *" }), { target: { value: "L2 Scheduled" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Interview date"), { target: { value: "2030-09-27" } });
    fireEvent.click(screen.getByRole("button", { name: "Timezone" }));

    const slot = await screen.findByRole("button", { name: "09:00–10:00" });
    fireEvent.click(slot);
    expect((screen.getByLabelText("Start time") as HTMLInputElement).value).toBe("09:00");
    expect((screen.getByLabelText("End time") as HTMLInputElement).value).toBe("10:00");
    fireEvent.change(screen.getByPlaceholderText("Meeting URL"), { target: { value: "https://example.com/meeting" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(api.checkConflicts).toHaveBeenCalledWith(
      ["panel-1"], "2030-09-27T03:30:00.000Z", "2030-09-27T04:30:00.000Z", "candidate-1",
    ));
    expect(await screen.findByText("Availability could not be verified. Go back and try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schedule Interview" }).hasAttribute("disabled")).toBe(true);
    fireEvent.submit(screen.getByRole("button", { name: "Schedule Interview" }).closest("form")!);
    expect(api.scheduleInterview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Schedule Interview" }).hasAttribute("disabled")).toBe(false));
    expect(screen.getByText("L2 Scheduled")).toBeTruthy();
    vi.mocked(api.scheduleInterview).mockResolvedValue({ interview_id: "interview-1", status: "L2 Scheduled" });
    fireEvent.click(screen.getByRole("button", { name: "Schedule Interview" }));
    await waitFor(() => expect(api.scheduleInterview).toHaveBeenCalledWith(expect.objectContaining({ status: "L2 Scheduled" })));
  });
});