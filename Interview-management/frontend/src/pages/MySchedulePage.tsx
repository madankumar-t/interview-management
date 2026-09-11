import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { PageShell } from "../components/PageShell";
import { InterviewDetailDrawer } from "../components/InterviewDetailDrawer";
import { api } from "../lib/api";
import type { InterviewListItem } from "../types/domain";
import type { Role } from "../types/auth";

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
    return "You are not authorized to view your schedule.";
  }
  return "Unable to load your schedule.";
}

function InterviewRow({
  interview,
  onOpen,
  showJoin,
  showFeedback,
}: {
  interview: InterviewListItem;
  onOpen: () => void;
  showJoin: boolean;
  showFeedback: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded border border-slate-200 p-3 md:flex-row md:items-center md:justify-between dark:border-slate-800">
      <button type="button" className="flex-1 text-left" onClick={onOpen}>
        <p className="font-medium">{interview.candidate_name || "Unknown candidate"}</p>
        <p className="text-sm text-slate-500">
          {interview.requisition_title || interview.requisition_id} · {interview.round_name}
        </p>
        <p className="text-sm text-slate-500">
          {dayjs(interview.start_utc).format("ddd, MMM D · HH:mm")}–{dayjs(interview.end_utc).format("HH:mm")}
        </p>
      </button>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLES[interview.status] ?? "bg-slate-100 text-slate-700"}`}>
          {interview.status}
        </span>
        {showJoin && interview.mode === "Online" && interview.meeting_url && (
          <a
            href={interview.meeting_url}
            target="_blank"
            rel="noreferrer"
            className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700"
          >
            Join Interview
          </a>
        )}
        {showFeedback && (
          <Link to={`/interviews/${interview.interview_id}/feedback`} className="rounded bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700">
            Submit Feedback
          </Link>
        )}
      </div>
    </div>
  );
}

export function MySchedulePage({ groups }: { groups: Role[] }) {
  const [interviews, setInterviews] = useState<InterviewListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<InterviewListItem | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .listInterviews({ mineOnly: true })
      .then((data) => setInterviews(data.interviews))
      .catch((reason: unknown) => {
        setInterviews([]);
        setError(describeError(reason));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load, retryToken]);

  const groupedInterviews = useMemo(() => {
    const today = dayjs().format("YYYY-MM-DD");
    const groupsResult = { today: [] as InterviewListItem[], upcoming: [] as InterviewListItem[], completed: [] as InterviewListItem[] };
    for (const interview of interviews) {
      const date = dayjs(interview.start_utc).format("YYYY-MM-DD");
      if (date === today) {
        groupsResult.today.push(interview);
      } else if (date > today) {
        groupsResult.upcoming.push(interview);
      } else {
        groupsResult.completed.push(interview);
      }
    }
    groupsResult.today.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
    groupsResult.upcoming.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
    groupsResult.completed.sort((a, b) => b.start_utc.localeCompare(a.start_utc));
    return groupsResult;
  }, [interviews]);

  return (
    <PageShell title="My Schedule">
      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded bg-red-50 p-3 text-red-700">
          <span>{error}</span>
          <button type="button" className="shrink-0 rounded bg-red-700 px-3 py-1 text-sm text-white hover:bg-red-800" onClick={() => setRetryToken((c) => c + 1)}>
            Retry
          </button>
        </div>
      )}

      {loading && <p className="text-slate-500">Loading your schedule…</p>}

      {!loading && !error && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 font-semibold text-slate-700 dark:text-slate-200">Today ({groupedInterviews.today.length})</h3>
            {groupedInterviews.today.length === 0 && <p className="text-sm text-slate-500">No interviews scheduled for today.</p>}
            <div className="space-y-2">
              {groupedInterviews.today.map((interview) => (
                <InterviewRow key={interview.interview_id} interview={interview} onOpen={() => setSelected(interview)} showJoin showFeedback={false} />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-700 dark:text-slate-200">Upcoming ({groupedInterviews.upcoming.length})</h3>
            {groupedInterviews.upcoming.length === 0 && <p className="text-sm text-slate-500">No upcoming interviews.</p>}
            <div className="space-y-2">
              {groupedInterviews.upcoming.map((interview) => (
                <InterviewRow key={interview.interview_id} interview={interview} onOpen={() => setSelected(interview)} showJoin={false} showFeedback={false} />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-700 dark:text-slate-200">Completed ({groupedInterviews.completed.length})</h3>
            {groupedInterviews.completed.length === 0 && <p className="text-sm text-slate-500">No completed interviews yet.</p>}
            <div className="space-y-2">
              {groupedInterviews.completed.map((interview) => (
                <InterviewRow
                  key={interview.interview_id}
                  interview={interview}
                  onOpen={() => setSelected(interview)}
                  showJoin={false}
                  showFeedback={interview.status === "Completed"}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      {selected && (
        <InterviewDetailDrawer interview={selected} groups={groups} onClose={() => setSelected(null)} onChanged={() => setRetryToken((c) => c + 1)} />
      )}
    </PageShell>
  );
}
