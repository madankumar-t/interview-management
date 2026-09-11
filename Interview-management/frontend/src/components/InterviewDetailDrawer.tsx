import { useState } from "react";
import type { InterviewListItem } from "../types/domain";
import type { Role } from "../types/auth";
import { api } from "../lib/api";
import { detectTimezone } from "../lib/datetime";

const MANAGE_ROLES: Role[] = ["Administrator", "Manager", "TA"];

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("409")) {
    return "This interview changed since you loaded it (version conflict). Refresh and try again.";
  }
  if (message.startsWith("401")) {
    return "Your session has expired. Please log in again.";
  }
  if (message.startsWith("403")) {
    return "You are not authorized to make this change.";
  }
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  return "Unable to save changes. Please try again.";
}

export function InterviewDetailDrawer({
  interview,
  groups,
  onClose,
  onChanged,
}: {
  interview: InterviewListItem;
  groups: Role[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const canManage = MANAGE_ROLES.some((role) => groups.includes(role));
  const isActive = interview.status === "Scheduled" || interview.status === "In Progress";

  const [mode, setMode] = useState<"view" | "reschedule" | "cancel">("view");
  const [date, setDate] = useState(interview.start_utc.slice(0, 10));
  const [startTime, setStartTime] = useState(new Date(interview.start_utc).toISOString().slice(11, 16));
  const [endTime, setEndTime] = useState(new Date(interview.end_utc).toISOString().slice(11, 16));
  const [tz, setTz] = useState(interview.timezone || detectTimezone());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submitReschedule() {
    setSubmitting(true);
    setError("");
    try {
      await api.rescheduleInterview(interview.interview_id, {
        start_local_iso: `${date}T${startTime}:00`,
        end_local_iso: `${date}T${endTime}:00`,
        timezone: tz,
        reason,
        idempotency_key: crypto.randomUUID(),
        expected_version: interview.version,
      });
      onChanged();
      onClose();
    } catch (reasonErr) {
      setError(describeError(reasonErr));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCancel() {
    setSubmitting(true);
    setError("");
    try {
      await api.cancelInterview(interview.interview_id, {
        reason,
        idempotency_key: crypto.randomUUID(),
        expected_version: interview.version,
      });
      onChanged();
      onClose();
    } catch (reasonErr) {
      setError(describeError(reasonErr));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl dark:bg-slate-950"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Interview Details</h3>
          <button type="button" className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={onClose}>
            Close
          </button>
        </div>

        {mode === "view" && (
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-slate-500">Candidate</p>
              <p className="font-medium">{interview.candidate_name || "Unknown candidate"}</p>
            </div>
            <div>
              <p className="text-slate-500">Requirement</p>
              <p className="font-medium">{interview.requisition_title || interview.requisition_id}</p>
              <p className="text-slate-500">{interview.client_name}</p>
            </div>
            <div>
              <p className="text-slate-500">Round</p>
              <p className="font-medium">
                {interview.round_name} — {interview.interview_type}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Date &amp; Time</p>
              <p className="font-medium">
                {new Date(interview.start_utc).toLocaleString()} – {new Date(interview.end_utc).toLocaleTimeString()}
              </p>
              <p className="text-slate-500">{interview.timezone}</p>
            </div>
            <div>
              <p className="text-slate-500">Location</p>
              <p className="font-medium">
                {interview.mode === "Online" ? (
                  interview.meeting_url ? (
                    <a className="text-indigo-600 underline" href={interview.meeting_url} target="_blank" rel="noreferrer">
                      {interview.meeting_url}
                    </a>
                  ) : (
                    "—"
                  )
                ) : (
                  interview.venue || "—"
                )}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Status</p>
              <p className="font-medium">{interview.status}</p>
            </div>
            {interview.instructions && (
              <div>
                <p className="text-slate-500">Instructions</p>
                <p>{interview.instructions}</p>
              </div>
            )}

            {canManage && isActive && (
              <div className="flex gap-2 pt-3">
                <button type="button" className="rounded bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700" onClick={() => setMode("reschedule")}>
                  Reschedule
                </button>
                <button type="button" className="rounded bg-red-700 px-3 py-2 text-white hover:bg-red-800" onClick={() => setMode("cancel")}>
                  Cancel Interview
                </button>
              </div>
            )}
          </div>
        )}

        {mode === "reschedule" && (
          <div className="space-y-3">
            {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
            <div>
              <label className="mb-1 block text-sm font-medium">Date</label>
              <input type="date" className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Start</label>
                <input type="time" className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">End</label>
                <input type="time" className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <input className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Timezone" />
            <textarea
              className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Reason for rescheduling"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
            <div className="flex gap-2">
              <button type="button" className="rounded border border-slate-300 px-3 py-2 dark:border-slate-700" onClick={() => setMode("view")}>
                Back
              </button>
              <button
                type="button"
                className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-40 hover:bg-indigo-700"
                disabled={submitting || !reason}
                onClick={submitReschedule}
              >
                {submitting ? "Saving…" : "Confirm Reschedule"}
              </button>
            </div>
          </div>
        )}

        {mode === "cancel" && (
          <div className="space-y-3">
            {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
            <textarea
              className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Reason for cancellation"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
            <div className="flex gap-2">
              <button type="button" className="rounded border border-slate-300 px-3 py-2 dark:border-slate-700" onClick={() => setMode("view")}>
                Back
              </button>
              <button
                type="button"
                className="rounded bg-red-700 px-3 py-2 text-white disabled:opacity-40 hover:bg-red-800"
                disabled={submitting || !reason}
                onClick={submitCancel}
              >
                {submitting ? "Cancelling…" : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
