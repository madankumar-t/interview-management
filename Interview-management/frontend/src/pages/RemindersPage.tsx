import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";
import type { UserSession } from "../types/auth";

type Reminder = { id: string; interview_id: string; created_at: string };

export function RemindersPage({ session }: { session: UserSession }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.getMyReminders().then((result) => { if (active) setReminders(result.reminders); })
      .catch(() => { if (active) setError("Unable to load reminders."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session.sub]);

  async function dismiss(reminder: Reminder) {
    setError("");
    try {
      await api.dismissMyReminder(reminder.id);
      setReminders((current) => current.filter((item) => item.id !== reminder.id));
      window.dispatchEvent(new Event("ims-reminders-updated"));
    } catch { setError("Unable to dismiss reminder."); }
  }

  const isPanel = session.groups.includes("Panel");
  return (
    <PageShell title="Reminders">
      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
      {loading ? <p className="text-sm text-slate-500">Loading reminders…</p> : reminders.length === 0 ? (
        <p className="text-sm text-slate-500">No pending reminders.</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {reminders.map((reminder) => (
            <li key={reminder.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">Interview feedback overdue</p>
                <p className="text-sm text-slate-500">Interview {reminder.interview_id} · {new Date(reminder.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <Link to={isPanel ? `/interviews/${encodeURIComponent(reminder.interview_id)}/feedback` : "/interviews"} className="text-sm text-sky-700 hover:underline dark:text-sky-300">
                  {isPanel ? "Provide feedback" : "View interviews"}
                </Link>
                <button type="button" className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-700" onClick={() => void dismiss(reminder)}>Dismiss</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}