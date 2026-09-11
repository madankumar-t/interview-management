import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { RequirementOverview } from "../types/domain";

interface RequirementReportProps {
  showInterviewMetrics?: boolean;
}

const initialFilters = {
  requisitionId: "",
  clientName: "",
  status: "",
  openOnly: true,
};

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("401")) {
    return "Your session has expired. Please log in again.";
  }
  if (message.startsWith("403")) {
    return "You are not authorized to view this data.";
  }
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  if (message.startsWith("5")) {
    return "The server encountered an error while loading requirements. Please try again.";
  }
  return "Unable to load requirements.";
}

export function RequirementReport({ showInterviewMetrics = true }: RequirementReportProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [overview, setOverview] = useState<RequirementOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .getRequirementOverview(filters)
      .then((data) => {
        if (active) {
          setOverview(data);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setOverview(null);
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
  }, [filters, retryToken]);

  const hasError = Boolean(error);
  const summary = overview?.summary;

  function formatMetric(value: number | undefined): string {
    if (loading) {
      return "…";
    }
    if (hasError) {
      return "—";
    }
    return String(value ?? 0);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <select
          className="rounded border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
          value={filters.requisitionId}
          onChange={(event) => setFilters((current) => ({ ...current, requisitionId: event.target.value }))}
          aria-label="Filter by requirement"
        >
          <option value="">All requirements</option>
          {overview?.filters.requisitions.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select
          className="rounded border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
          value={filters.clientName}
          onChange={(event) => setFilters((current) => ({ ...current, clientName: event.target.value }))}
          aria-label="Filter by client"
        >
          <option value="">All clients</option>
          {overview?.filters.clients.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select
          className="rounded border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
          value={filters.status}
          onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {overview?.filters.statuses.map((value) => <option key={value}>{value}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
          <input
            type="checkbox"
            checked={filters.openOnly}
            onChange={(event) => setFilters((current) => ({ ...current, openOnly: event.target.checked }))}
          />
          Open requirements only
        </label>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded bg-red-50 p-3 text-red-700">
          <span>{error}</span>
          <button
            type="button"
            className="shrink-0 rounded bg-red-700 px-3 py-1 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-400"
            onClick={() => setRetryToken((current) => current + 1)}
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Open Requirements", summary?.open_requirements],
            ["Open Positions", summary?.open_positions],
            ["Clients", summary?.clients],
            ["Upcoming Interviews", summary?.upcoming_interviews],
          ] as const
        ).map(([label, value]) => (
          <article key={label} className="rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-slate-900">
            <p className="text-sm text-slate-600 dark:text-slate-300">{label}</p>
            <p className="mt-1 text-3xl font-semibold text-sky-800 dark:text-sky-300">{formatMetric(value)}</p>
          </article>
        ))}
      </div>

      <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-900">
            <tr>
              <th className="p-3 text-left">Requirement</th>
              <th className="p-3 text-left">Client</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-right">Positions</th>
              <th className="p-3 text-right">Open</th>
              {showInterviewMetrics && <th className="p-3 text-right">Interviews</th>}
              {showInterviewMetrics && <th className="p-3 text-right">Scheduled</th>}
              {showInterviewMetrics && <th className="p-3 text-right">Completed</th>}
              {showInterviewMetrics && <th className="p-3 text-right">Pending Feedback</th>}
            </tr>
          </thead>
          <tbody>
            {overview?.requirements.map((row) => (
              <tr key={row.requisition_id} className="border-t border-slate-200 dark:border-slate-800">
                <td className="p-3">
                  <div className="font-medium">{row.requisition_id}</div>
                  <div className="text-slate-500">{row.title}</div>
                </td>
                <td className="p-3">{row.client_name || "--"}</td>
                <td className="p-3"><span className="rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200">{row.status}</span></td>
                <td className="p-3 text-right">{row.positions_filled}/{row.positions_total}</td>
                <td className="p-3 text-right font-semibold">{row.positions_open}</td>
                {showInterviewMetrics && <td className="p-3 text-right">{row.interviews_total}</td>}
                {showInterviewMetrics && <td className="p-3 text-right">{row.scheduled}</td>}
                {showInterviewMetrics && <td className="p-3 text-right">{row.completed}</td>}
                {showInterviewMetrics && <td className="p-3 text-right">{row.pending_feedback}</td>}
              </tr>
            ))}
            {!loading && hasError && (
              <tr>
                <td className="p-6 text-center text-red-700" colSpan={showInterviewMetrics ? 9 : 5}>
                  Unable to load requirements.
                </td>
              </tr>
            )}
            {!loading && !hasError && overview?.requirements.length === 0 && (
              <tr>
                <td className="p-6 text-center text-slate-500" colSpan={showInterviewMetrics ? 9 : 5}>
                  No requirements match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
