import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  if (message.startsWith("401")) {
    return "Your session has expired. Please log in again.";
  }
  if (message.startsWith("403")) {
    return "You are not authorized to view interviews.";
  }
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  return "Unable to load interviews.";
}

export function InterviewsPage({ groups }: { groups: Role[] }) {
  const [interviews, setInterviews] = useState<InterviewListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [selected, setSelected] = useState<InterviewListItem | null>(null);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .listInterviews({ status, q: search, mineOnly })
      .then((data) => {
        if (active) {
          setInterviews(data.interviews);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setInterviews(null);
          setError(describeError(reason));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [status, search, mineOnly]);

  useEffect(() => load(), [load, retryToken]);

  return (
    <PageShell title="Interviews">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row">
          <input
            className="rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
            placeholder="Search candidate, requirement, or requisition ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
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
          <label className="flex items-center gap-2 rounded border border-slate-300 px-3 dark:border-slate-700">
            <input type="checkbox" checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} />
            My interviews only
          </label>
        </div>
        {groups.some((role) => role === "Administrator" || role === "Manager") && (
          <Link
            to="/interviews/new"
            className="whitespace-nowrap rounded bg-indigo-600 px-4 py-2 text-center text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Schedule Interview
          </Link>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded bg-red-50 p-3 text-red-700">
          <span>{error}</span>
          <button
            type="button"
            className="shrink-0 rounded bg-red-700 px-3 py-1 text-sm font-medium text-white hover:bg-red-800"
            onClick={() => setRetryToken((current) => current + 1)}
          >
            Retry
          </button>
        </div>
      )}

      <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-900">
            <tr>
              <th className="p-3 text-left">Candidate</th>
              <th className="p-3 text-left">Requirement</th>
              <th className="p-3 text-left">Round</th>
              <th className="p-3 text-left">Date &amp; Time</th>
              <th className="p-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              [0, 1, 2].map((key) => (
                <tr key={key} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="p-3 text-slate-400" colSpan={5}>
                    Loading interviews…
                  </td>
                </tr>
              ))}
            {!loading && error && (
              <tr>
                <td className="p-6 text-center text-red-700" colSpan={5}>
                  Unable to load interviews.
                </td>
              </tr>
            )}
            {!loading && !error && interviews?.length === 0 && (
              <tr>
                <td className="p-6 text-center text-slate-500" colSpan={5}>
                  No interviews match your filters.
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              interviews?.map((interview) => (
                <tr
                  key={interview.interview_id}
                  className="cursor-pointer border-t border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                  onClick={() => setSelected(interview)}
                >
                  <td className="p-3">
                    <div className="font-medium">{interview.candidate_name || "Unknown candidate"}</div>
                  </td>
                  <td className="p-3">
                    <div>{interview.requisition_title || interview.requisition_id}</div>
                    <div className="text-slate-500">{interview.client_name}</div>
                  </td>
                  <td className="p-3">{interview.round_name}</td>
                  <td className="p-3">{new Date(interview.start_utc).toLocaleString()}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLES[interview.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {interview.status}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <InterviewDetailDrawer
          interview={selected}
          groups={groups}
          onClose={() => setSelected(null)}
          onChanged={() => setRetryToken((current) => current + 1)}
        />
      )}
    </PageShell>
  );
}

