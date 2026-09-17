import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";
import type { UserSession } from "../types/auth";
import type { FeedbackRecord, InterviewListItem } from "../types/domain";

type FeedbackQueueItem = InterviewListItem & {
  myFeedback?: FeedbackRecord;
};

const ELIGIBLE_STATUSES = new Set(["Scheduled", "Completed"]);

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("401")) {
    return "Your session has expired. Please log in again.";
  }
  if (message.startsWith("403")) {
    return "You are not authorized to view assigned feedback.";
  }
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  return "Unable to load feedback assignments.";
}

function actionLabel(item: FeedbackQueueItem): string {
  if (item.myFeedback?.status === "Submitted") {
    return "View Feedback";
  }
  if (item.myFeedback?.status === "Draft") {
    return "Continue Draft";
  }
  return "Provide Feedback";
}

export function PendingFeedbackPage({ session }: { session: UserSession }) {
  const [items, setItems] = useState<FeedbackQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"Pending" | "Submitted" | "All">("Pending");
  const [retryToken, setRetryToken] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const hasBroaderAccess = session.groups.some((role) => role === "Administrator" || role === "Manager" || role === "TA");
      const response = await api.listInterviews({ mineOnly: !hasBroaderAccess });
      const eligible = response.interviews.filter((interview) => ELIGIBLE_STATUSES.has(interview.status));
      const withFeedback = await Promise.all(
        eligible.map(async (interview) => {
          const records = await api.getFeedbackForInterview(interview.interview_id);
          return {
            ...interview,
            myFeedback: records.find((record) => record.author_sub === session.sub),
          };
        }),
      );
      setItems(withFeedback);
    } catch (reason) {
      setItems([]);
      setError(describeError(reason));
    } finally {
      setLoading(false);
    }
  }, [session.groups, session.sub]);

  useEffect(() => {
    void load();
  }, [load, retryToken]);

  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (filter === "All") return true;
      const submitted = item.myFeedback?.status === "Submitted";
      return filter === "Submitted" ? submitted : !submitted;
    });
    return filtered.sort((a, b) => b.start_utc.localeCompare(a.start_utc));
  }, [filter, items]);

  const pendingCount = items.filter((item) => item.myFeedback?.status !== "Submitted").length;
  const submittedCount = items.length - pendingCount;

  return (
    <PageShell title="Pending Feedback">
      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded bg-red-50 p-3 text-red-700">
          <span>{error}</span>
          <button
            type="button"
            className="shrink-0 rounded bg-red-700 px-3 py-1 text-sm text-white hover:bg-red-800"
            onClick={() => setRetryToken((current) => current + 1)}
          >
            Retry
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["Pending", "Submitted", "All"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={`rounded px-3 py-2 text-sm ${
              filter === option
                ? "bg-indigo-600 text-white"
                : "border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            }`}
            onClick={() => setFilter(option)}
          >
            {option} ({option === "Pending" ? pendingCount : option === "Submitted" ? submittedCount : items.length})
          </button>
        ))}
      </div>

      {loading && <p className="text-slate-500">Loading feedback assignments…</p>}

      {!loading && !error && visibleItems.length === 0 && (
        <div className="rounded border border-slate-200 bg-white p-6 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-950">
          {filter === "Pending"
            ? "No feedback is pending for your scheduled or completed interviews."
            : `No ${filter.toLowerCase()} feedback assignments found.`}
        </div>
      )}

      {!loading && !error && visibleItems.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 dark:bg-slate-900">
              <tr>
                <th className="p-3">Candidate</th>
                <th className="p-3">Requirement</th>
                <th className="p-3">Round</th>
                <th className="p-3">Interview</th>
                <th className="p-3">Feedback</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.interview_id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="p-3 font-medium">{item.candidate_name || "Unknown candidate"}</td>
                  <td className="p-3">
                    <p>{item.requisition_title || item.requisition_id}</p>
                    {item.client_name && <p className="text-xs text-slate-500">{item.client_name}</p>}
                  </td>
                  <td className="p-3">{item.round_name}</td>
                  <td className="p-3">
                    <p>{dayjs(item.start_utc).format("MMM D, YYYY · HH:mm")}</p>
                    <p className="text-xs text-slate-500">{item.status}</p>
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        item.myFeedback?.status === "Submitted"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.myFeedback?.status === "Draft"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {item.myFeedback?.status ?? "Not Started"}
                    </span>
                  </td>
                  <td className="p-3">
                    <Link
                      to={`/interviews/${item.interview_id}/feedback`}
                      className="inline-block rounded bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700"
                    >
                      {actionLabel(item)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
