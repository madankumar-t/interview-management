import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "./AppLayout";
import { resetMyPassword } from "../lib/auth";
import type { Role, UserSession } from "../types/auth";

vi.mock("../lib/auth", () => ({
  logout: vi.fn(),
  resetMyPassword: vi.fn(),
}));

function renderLayout(role: Role) {
  const session: UserSession = {
    sub: `${role}-1`,
    email: `${role.toLowerCase()}@example.com`,
    groups: [role],
    accessToken: "token",
  };
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<AppLayout session={session} onLogout={vi.fn()} />}>
          <Route index element={<p>Content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppLayout password reset", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  for (const role of ["Administrator", "Manager", "TA", "Panel"] as const) {
    it(`allows ${role} users to start their own password reset`, () => {
      renderLayout(role);
      fireEvent.click(screen.getByRole("button", { name: "Reset My Password" }));
      expect(resetMyPassword).toHaveBeenCalledOnce();
    });
  }
});
