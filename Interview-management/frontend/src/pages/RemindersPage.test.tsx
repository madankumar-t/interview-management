import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RemindersPage } from "./RemindersPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: { getMyReminders: vi.fn(), dismissMyReminder: vi.fn() } }));

describe("RemindersPage", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("shows a panel's overdue feedback and dismisses it", async () => {
    vi.mocked(api.getMyReminders).mockResolvedValue({ reminders: [{
      id: "REMINDER#FEEDBACK#int-1#1", interview_id: "int-1", created_at: "2030-09-28T10:00:00Z",
    }] });
    vi.mocked(api.dismissMyReminder).mockResolvedValue();
    render(<MemoryRouter><RemindersPage session={{ sub: "panel-1", email: "panel@example.com", groups: ["Panel"], accessToken: "token" }} /></MemoryRouter>);
    expect((await screen.findByRole("link", { name: "Provide feedback" })).getAttribute("href")).toBe("/interviews/int-1/feedback");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(api.dismissMyReminder).toHaveBeenCalledWith("REMINDER#FEEDBACK#int-1#1"));
    expect(await screen.findByText("No pending reminders.")).toBeTruthy();
  });
});