import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { cleanup, render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

afterEach(() => {
  cleanup();
});

describe("Sidebar", () => {
  it("gives TA a view-only slice: calendar, interviews, my schedule, and feedback", () => {
    render(
      <MemoryRouter>
        <Sidebar groups={["TA"]} />
      </MemoryRouter>
    );
    expect(screen.getByText("Interview Calendar")).not.toBeNull();
    expect(screen.getByText("Interviews")).not.toBeNull();
    expect(screen.getByText("My Schedule")).not.toBeNull();
    expect(screen.getByText("Pending Feedback")).not.toBeNull();

    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(screen.queryByText("Candidate List")).toBeNull();
    expect(screen.queryByText("Add Candidate")).toBeNull();
    expect(screen.queryByText("Requisition List")).toBeNull();
    expect(screen.queryByText("Panel List")).toBeNull();
    expect(screen.queryByText("Add Panel Member")).toBeNull();
    expect(screen.queryByText("User Management")).toBeNull();
    expect(screen.queryByText("Reports")).toBeNull();
    expect(screen.queryByText("Audit Log")).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("gives Manager access to scheduling, candidates, panels, and user management", () => {
    render(
      <MemoryRouter>
        <Sidebar groups={["Manager"]} />
      </MemoryRouter>
    );
    expect(screen.getByText("Dashboard")).not.toBeNull();
    expect(screen.getByText("Interviews")).not.toBeNull();
    expect(screen.getByText("Candidate List")).not.toBeNull();
    expect(screen.getByText("Panel List")).not.toBeNull();
    expect(screen.getByText("Add Panel Member")).not.toBeNull();
    expect(screen.getByText("User Management")).not.toBeNull();
    expect(screen.getByText("Reports")).not.toBeNull();

    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("gives Administrator access to every page including Settings", () => {
    render(
      <MemoryRouter>
        <Sidebar groups={["Administrator"]} />
      </MemoryRouter>
    );
    expect(screen.getByText("Dashboard")).not.toBeNull();
    expect(screen.getByText("Candidate List")).not.toBeNull();
    expect(screen.getByText("Panel List")).not.toBeNull();
    expect(screen.getByText("User Management")).not.toBeNull();
    expect(screen.getByText("Settings")).not.toBeNull();
    expect(screen.getByText("Audit Log")).not.toBeNull();
  });
});
