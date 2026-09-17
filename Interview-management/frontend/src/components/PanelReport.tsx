import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { PanelReport as PanelReportData } from "../types/domain";

type PanelTypeFilter = "" | "Internal" | "External";

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("401")) return "Your session has expired. Please log in again.";
  if (message.startsWith("403")) return "You are not authorized to view panel reports.";
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  return "Unable to load the panel report.";
}

export function PanelReport() {
  const [report, setReport] = useState<PanelReportData | null>(null);
  const [panelType, setPanelType] = useState<PanelTypeFilter>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .getPanelReport(panelType)
      .then(setReport)
      .catch((reason: unknown) => {
        setReport(null);
        setError(describeError(reason));
      })
      .finally(() => setLoading(false));
  }, [panelType]);

  useEffect(() => load(), [load]);

  return (
    <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-800">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-sky-800 dark:text-sky-300">Panel-wise Dashboard</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Internal and external interviewer workload, completion, feedback, and availability.
          </p>
        </div>
        <label className="text-sm font-medium">
          Panel type
          <select
            className="ml-2 rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
            value={panelType}
            onChange={(event) => setPanelType(event.target.value as PanelTypeFilter)}
          >
            <option value="">All panels</option>
            <option>Internal</option>
            <option>External</option>
          </select>
        </label>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-red-700">
          <span>{error}</span>
          <button type="button" className="rounded bg-red-700 px-3 py-1 text-white" onClick={load}>Retry</button>
        </div>
      )}
      {loading && <p className="text-slate-500">Loading panel report…</p>}

      {!loading && report && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(["Internal", "External"] as const).map((type) => {
              const summary = report.summary[type];
              return (
                <article key={type} className="rounded border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950">
                  <h4 className="font-semibold text-sky-900 dark:text-sky-200">{type} Panels</h4>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div><dt className="text-slate-500">Panel members</dt><dd className="text-xl font-semibold">{summary.panels}</dd></div>
                    <div><dt className="text-slate-500">Interviews</dt><dd className="text-xl font-semibold">{summary.interviews}</dd></div>
                    <div><dt className="text-slate-500">Completed</dt><dd className="text-xl font-semibold">{summary.completed}</dd></div>
                    <div><dt className="text-slate-500">Pending feedback</dt><dd className="text-xl font-semibold">{summary.pending_feedback}</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>

          <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 dark:bg-slate-900">
                <tr>
                  <th className="p-3">Panel Member</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Availability</th>
                  <th className="p-3">Interviews</th>
                  <th className="p-3">Scheduled</th>
                  <th className="p-3">Completed</th>
                  <th className="p-3">Cancelled</th>
                  <th className="p-3">Pending Feedback</th>
                </tr>
              </thead>
              <tbody>
                {report.panels.map((panel) => (
                  <tr key={panel.panel_id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="p-3"><p className="font-medium">{panel.full_name || panel.email || panel.sub}</p><p className="text-xs text-slate-500">{panel.email}</p></td>
                    <td className="p-3">{panel.panel_type}</td>
                    <td className="p-3">{panel.availability_slots} windows</td>
                    <td className="p-3">{panel.interviews_total}</td>
                    <td className="p-3">{panel.scheduled}</td>
                    <td className="p-3">{panel.completed}</td>
                    <td className="p-3">{panel.cancelled}</td>
                    <td className="p-3">{panel.pending_feedback}</td>
                  </tr>
                ))}
                {report.panels.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-slate-500">No panel members found for this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
