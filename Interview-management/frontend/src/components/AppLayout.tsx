import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import type { UserSession } from "../types/auth";
import { Sidebar } from "./Sidebar";
import { logout, resetMyPassword } from "../lib/auth";
import { api } from "../lib/api";

export function AppLayout({ session, onLogout }: { session: UserSession; onLogout: () => void }) {
  const [isDark, setIsDark] = useState(() => localStorage.getItem("ims-theme") === "dark");
  const [displayName, setDisplayName] = useState(session.name || session.email || session.sub);
  const [photoUrl, setPhotoUrl] = useState("");
  const [reminderCount, setReminderCount] = useState(0);
  useEffect(() => {
    let active = true;
    function refresh() {
      void api.getMyReminders().then((result) => {
        if (active) setReminderCount(result.reminders.length);
      }).catch(() => { if (active) setReminderCount(0); });
    }
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("ims-reminders-updated", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("ims-reminders-updated", refresh);
    };
  }, [session.sub]);
  useEffect(() => {
    let active = true;
    let currentUrl = "";
    async function refreshProfile() {
      try {
        const profile = await api.getMyProfile();
        if (!active) return;
        setDisplayName(profile.display_name || session.name || session.email || session.sub);
        if (profile.has_photo) {
          const blob = await api.getMyProfilePhoto();
          if (!active) return;
          const nextUrl = URL.createObjectURL(blob);
          setPhotoUrl(nextUrl);
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          currentUrl = nextUrl;
        } else {
          setPhotoUrl("");
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          currentUrl = "";
        }
      } catch {
        // Keep the session identity visible if the profile service is unavailable.
      }
    }
    void refreshProfile();
    window.addEventListener("ims-profile-updated", refreshProfile);
    return () => {
      active = false;
      window.removeEventListener("ims-profile-updated", refreshProfile);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [session.sub, session.name, session.email]);
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
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link to="/profile" aria-label="Profile settings" className="flex min-w-0 items-center gap-2 text-sm text-sky-700 hover:underline dark:text-sky-300">
            {photoUrl ? <img src={photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 font-semibold text-sky-800 dark:bg-sky-900 dark:text-sky-100">{displayName.charAt(0).toUpperCase()}</span>
            )}
            <span className="max-w-64 truncate">{displayName}</span>
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link to="/reminders" className="rounded border border-sky-700 px-3 py-2 text-sm text-sky-800 dark:text-sky-200">
              Reminders{reminderCount > 0 ? ` (${reminderCount})` : ""}
            </Link>
            <button
              type="button"
              className="rounded border border-sky-700 px-3 py-2 text-sky-800 dark:text-sky-200"
              onClick={resetMyPassword}
            >
              Reset My Password
            </button>
            <button
              className="rounded bg-sky-700 px-3 py-2 text-white"
              onClick={() => {
                setIsDark((prev) => !prev);
              }}
            >
              {isDark ? "Light Mode" : "Dark Mode"}
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
