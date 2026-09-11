import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs, { Dayjs } from "dayjs";
import { PageShell } from "../components/PageShell";
import { InterviewDetailDrawer } from "../components/InterviewDetailDrawer";
import { api } from "../lib/api";
import { detectTimezone } from "../lib/datetime";
import type { InterviewListItem } from "../types/domain";
import type { Role } from "../types/auth";

type ViewMode = "month" | "week" | "day" | "agenda";

const STATUS_STYLES: Record<string, string> = {
  Scheduled: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "In Progress": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  Completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  Cancelled: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "No Show": "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  if (message.startsWith("401")) {
    return "Your session has expired. Please log in again.";
  }
  if (message.startsWith("403")) {
    return "You are not authorized to view this calendar.";
  }
  return "Unable to load the calendar.";
}

function rangeForView(view: ViewMode, anchor: Dayjs): { start: Dayjs; end: Dayjs } {
  if (view === "month") {
    return { start: anchor.startOf("month").startOf("week"), end: anchor.endOf("month").endOf("week") };
  }
  if (view === "week") {
    return { start: anchor.startOf("week"), end: anchor.endOf("week") };
  }
  if (view === "day") {
    return { start: anchor.startOf("day"), end: anchor.endOf("day") };
  }
  return { start: anchor.startOf("day"), end: anchor.add(13, "day").endOf("day") };
}

function eventLabel(interview: InterviewListItem): string {
  return `${dayjs(interview.start_utc).format("HH:mm")} ${interview.candidate_name || "Unknown"}`;
}

export function CalendarPage({ groups }: { groups: Role[] }) {
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(dayjs());
  const [status, setStatus] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [interviews, setInterviews] = useState<InterviewListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<InterviewListItem | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const { start, end } = useMemo(() => rangeForView(view, anchor), [view, anchor]);
  const tz = useMemo(() => detectTimezone(), []);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .listInterviews({
        status,
        mineOnly,
        startDate: start.format("YYYY-MM-DD"),
        endDate: end.format("YYYY-MM-DD"),
        timezone: tz,
      })
      .then((data) => setInterviews(data.interviews))
      .catch((reason: unknown) => {
        setInterviews([]);
        setError(describeError(reason));
      })
      .finally(() => setLoading(false));
  }, [status, mineOnly, start, end, tz]);

  useEffect(() => load(), [load, retryToken]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, InterviewListItem[]>();
    for (const interview of interviews) {
      const key = dayjs(interview.start_utc).format("YYYY-MM-DD");
      const list = map.get(key) ?? [];
      list.push(interview);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
    }
    return map;
  }, [interviews]);

  function navigate(direction: -1 | 1) {
    if (view === "month") {
      setAnchor((current) => current.add(direction, "month"));
    } else if (view === "week") {
      setAnchor((current) => current.add(direction, "week"));
    } else if (view === "day") {
      setAnchor((current) => current.add(direction, "day"));
    } else {
      setAnchor((current) => current.add(direction * 14, "day"));
    }
  }

  function renderChip(interview: InterviewListItem) {
    return (
      <button
        key={interview.interview_id}
        type="button"
        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs ${STATUS_STYLES[interview.status] ?? "bg-slate-100 text-slate-700"}`}
        onClick={() => setSelected(interview)}
        title={`${interview.candidate_name} — ${interview.round_name}`}
      >
        {eventLabel(interview)}
      </button>
    );
  }

  const days: Dayjs[] = [];
  if (view === "month" || view === "week") {
    let cursor = start;
    while (cursor.isBefore(end) || cursor.isSame(end, "day")) {
      days.push(cursor);
      cursor = cursor.add(1, "day");
    }
  }

  const agendaDays: Dayjs[] = [];
  if (view === "agenda") {
    let cursor = start;
    while (cursor.isBefore(end) || cursor.isSame(end, "day")) {
      agendaDays.push(cursor);
      cursor = cursor.add(1, "day");
    }
  }

  return (
    <PageShell title="Interview Calendar">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["month", "week", "day", "agenda"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`rounded px-3 py-1 text-sm capitalize ${
                view === mode ? "bg-indigo-600 text-white" : "border border-slate-300 dark:border-slate-700"
              }`}
              onClick={() => setView(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded border border-slate-300 px-3 py-1 dark:border-slate-700" onClick={() => navigate(-1)}>
            ← Prev
          </button>
          <button type="button" className="rounded border border-slate-300 px-3 py-1 dark:border-slate-700" onClick={() => setAnchor(dayjs())}>
            Today
          </button>
          <button type="button" className="rounded border border-slate-300 px-3 py-1 dark:border-slate-700" onClick={() => navigate(1)}>
            Next →
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option>Scheduled</option>
            <option>In Progress</option>
            <option>Completed</option>
            <option>Cancelled</option>
            <option>No Show</option>
          </select>
          <label className="flex items-center gap-2 rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-700">
            <input type="checkbox" checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} />
            My interviews only
          </label>
        </div>
      </div>

      <p className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-300">
        {view === "day" ? anchor.format("dddd, MMMM D, YYYY") : `${start.format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`}
      </p>

      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded bg-red-50 p-3 text-red-700">
          <span>{error}</span>
          <button type="button" className="shrink-0 rounded bg-red-700 px-3 py-1 text-sm text-white hover:bg-red-800" onClick={() => setRetryToken((c) => c + 1)}>
            Retry
          </button>
        </div>
      )}

      {loading && <p className="text-slate-500">Loading calendar…</p>}

      {!loading && !error && (view === "month" || view === "week") && (
        <div className={`grid grid-cols-7 gap-1 ${view === "month" ? "" : ""}`}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
            <div key={label} className="p-1 text-center text-xs font-semibold text-slate-500">
              {label}
            </div>
          ))}
          {days.map((day) => {
            const key = day.format("YYYY-MM-DD");
            const dayEvents = eventsByDate.get(key) ?? [];
            const isOtherMonth = view === "month" && day.month() !== anchor.month();
            const visible = dayEvents.slice(0, 3);
            const overflow = dayEvents.length - visible.length;
            return (
              <div
                key={key}
                className={`min-h-[6rem] rounded border border-slate-200 p-1 dark:border-slate-800 ${
                  isOtherMonth ? "bg-slate-50 dark:bg-slate-900/50" : ""
                } ${day.isSame(dayjs(), "day") ? "ring-2 ring-indigo-400" : ""}`}
              >
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{day.format("D")}</span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {visible.map(renderChip)}
                  {overflow > 0 && (
                    <button
                      type="button"
                      className="text-xs text-indigo-600 hover:underline"
                      onClick={() => {
                        setAnchor(day);
                        setView("day");
                      }}
                    >
                      +{overflow} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && view === "day" && (
        <div className="space-y-2">
          {(eventsByDate.get(anchor.format("YYYY-MM-DD")) ?? []).length === 0 && (
            <p className="rounded border border-slate-200 p-4 text-center text-slate-500 dark:border-slate-800">
              No interviews scheduled for this day.
            </p>
          )}
          {(eventsByDate.get(anchor.format("YYYY-MM-DD")) ?? []).map((interview) => (
            <button
              key={interview.interview_id}
              type="button"
              className="flex w-full items-center justify-between rounded border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
              onClick={() => setSelected(interview)}
            >
              <div>
                <p className="font-medium">{interview.candidate_name || "Unknown candidate"}</p>
                <p className="text-sm text-slate-500">
                  {interview.requisition_title || interview.requisition_id} · {interview.round_name}
                </p>
              </div>
              <div className="text-right text-sm">
                <p>
                  {dayjs(interview.start_utc).format("HH:mm")}–{dayjs(interview.end_utc).format("HH:mm")}
                </p>
                <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLES[interview.status] ?? "bg-slate-100 text-slate-700"}`}>
                  {interview.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && !error && view === "agenda" && (
        <div className="space-y-4">
          {agendaDays.map((day) => {
            const key = day.format("YYYY-MM-DD");
            const dayEvents = eventsByDate.get(key) ?? [];
            if (dayEvents.length === 0) {
              return null;
            }
            return (
              <div key={key}>
                <h4 className="mb-1 text-sm font-semibold text-slate-600 dark:text-slate-300">{day.format("dddd, MMMM D")}</h4>
                <div className="space-y-1">
                  {dayEvents.map((interview) => (
                    <button
                      key={interview.interview_id}
                      type="button"
                      className="flex w-full items-center justify-between rounded border border-slate-200 p-2 text-left text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                      onClick={() => setSelected(interview)}
                    >
                      <span>
                        {dayjs(interview.start_utc).format("HH:mm")} · {interview.candidate_name || "Unknown"} — {interview.round_name}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLES[interview.status] ?? "bg-slate-100 text-slate-700"}`}>
                        {interview.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {agendaDays.every((day) => (eventsByDate.get(day.format("YYYY-MM-DD")) ?? []).length === 0) && (
            <p className="rounded border border-slate-200 p-4 text-center text-slate-500 dark:border-slate-800">
              No interviews scheduled in this period.
            </p>
          )}
        </div>
      )}

      {selected && (
        <InterviewDetailDrawer
          interview={selected}
          groups={groups}
          onClose={() => setSelected(null)}
          onChanged={() => setRetryToken((c) => c + 1)}
        />
      )}
    </PageShell>
  );
}
