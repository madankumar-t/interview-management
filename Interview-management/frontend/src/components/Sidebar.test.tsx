import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("hides admin pages for TA", () => {
    render(
      <MemoryRouter>
        <Sidebar groups={["TA"]} />
      </MemoryRouter>
    );
    expect(screen.queryByText("User Management")).toBeNull();
    expect(screen.getByText("Candidates")).not.toBeNull();
  });
});
