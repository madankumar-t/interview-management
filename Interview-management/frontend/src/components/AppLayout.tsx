import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import type { UserSession } from "../types/auth";
import { Sidebar } from "./Sidebar";
import { logout } from "../lib/auth";

export function AppLayout({ session, onLogout }: { session: UserSession; onLogout: () => void }) {
  const [isDark, setIsDark] = useState(() => localStorage.getItem("ims-theme") === "dark");
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("ims-theme", "dark");
      return;
    }
    document.documentElement.classList.remove("dark");
    localStorage.setItem("ims-theme", "light");
  }, [isDark]);
  return (
    <div className="flex">
      <Sidebar groups={session.groups} />
      <main className="flex-1 p-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-sky-700 dark:text-sky-300">{session.email}</p>
            <p className="text-sm">Roles: {session.groups.join(", ")}</p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded bg-sky-700 px-3 py-2 text-white"
              onClick={() => {
                setIsDark((prev) => !prev);
              }}
            >
              {isDark ? "Light Blue Mode" : "Black Mode"}
            </button>
            <button
              className="rounded bg-slate-800 px-3 py-2 text-white"
              onClick={() => {
                logout();
                onLogout();
              }}
            >
              Logout
            </button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
