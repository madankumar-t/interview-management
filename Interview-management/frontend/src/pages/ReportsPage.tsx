import { useMemo, useState } from "react";
import { PageShell } from "../components/PageShell";
import { RequirementReport } from "../components/RequirementReport";
import { PanelReport } from "../components/PanelReport";
import { api } from "../lib/api";
import type { MonthlyReport } from "../types/domain";

interface DailyReport {
  date: string;
  timezone: string;
  total_scheduled: number;
  by_requisition: Array<{
    requisition_id: string;
    title: string;
    client_name: string;
    scheduled_count: number;
  }>;
}

interface WeeklyReport {
  week_start: string;
  week_end_exclusive: string;
  timezone: string;
  requirements: Array<{
    requisition_id: string;
    title: string;
    client_name: string;
    status: string;
    positions_total: number;
    positions_filled: number;
    positions_open: number;
    interviews_total: number;
    scheduled: number;
    completed: number;
    cancelled: number;
  }>;
}

function downloadCsv(report: MonthlyReport): void {
  const headers = [
    "Requisition ID",
    "Title",
    "Client",
    "Total",
    "Scheduled",
    "In Progress",
    "Completed",
    "Cancelled",
    "No Show",
    "Pending Feedback",
  ];
  const values = report.rows.map((row) => [
    row.requisition_id,
    row.title,
    row.client_name,
    row.total,
    row.scheduled,
    row.in_progress,
    row.completed,
    row.cancelled,
    row.no_show,
    row.pending_feedback,
  ]);
  const panelValues = report.panel_rows.map((row) => [
    row.panel_sub,
    row.full_name || row.email,
    row.panel_type,
    row.total,
    row.scheduled,
    row.in_progress,
    row.completed,
    row.cancelled,
    row.no_show,
    row.pending_feedback,
  ]);
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const panelHeaders = ["Panel Sub", "Panel Member", "Panel Type", ...headers.slice(3)];
  const csv = [
    ["Requirement/Client Pivot"],
    headers,
    ...values,
    [],
    ["Panel-wise Pivot"],
    panelHeaders,
    ...panelValues,
  ].map((row) => row.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `interview-report-${report.month}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonth = today.slice(0, 7);
  const [date, setDate] = useState(today);
  const [weekStart, setWeekStart] = useState(today);
  const [month, setMonth] = useState(currentMonth);
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null);
  const [daily, setDaily] = useState<DailyReport | null>(null);
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState("");

  async function loadReports() {
    try {
      setError("");
      const [dailyData, weeklyData] = await Promise.all([
        api.getDailyInterviewsReport(date),
        api.getWeeklyRequirementReport(weekStart),
      ]);
      setDaily(dailyData as DailyReport);
      setWeekly(weeklyData as WeeklyReport);
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadMonthlyReport() {
    try {
      setError("");
      setMonthly(await api.getMonthlyInterviewsReport(month));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <PageShell title="Reports">
      <section className="mb-8 space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-sky-800 dark:text-sky-300">Requirement Status Report</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">Live totals across clients, requirements, positions, interviews, and feedback.</p>
        </div>
        <RequirementReport />
      </section>
      <PanelReport />
      <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-800">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-sky-800 dark:text-sky-300">Monthly Interview Dashboard</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Monthly status totals and a requisition/client pivot table.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
              aria-label="Monthly report month"
            />
            <button type="button" className="rounded bg-indigo-600 px-4 py-2 text-white" onClick={loadMonthlyReport}>
              Load Monthly Report
            </button>
            <button
              type="button"
              className="rounded border border-indigo-600 px-4 py-2 text-indigo-700 disabled:opacity-40 dark:text-indigo-300"
              onClick={() => monthly && downloadCsv(monthly)}
              disabled={!monthly}
            >
              Download CSV
            </button>
          </div>
        </div>
        {monthly && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {([
                ["Total", monthly.summary.total],
                ["Scheduled", monthly.summary.scheduled],
                ["Completed", monthly.summary.completed],
                ["Pending feedback", monthly.summary.pending_feedback],
              ] as const).map(([label, value]) => (
                <article key={label} className="rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-slate-900">
                  <p className="text-sm text-slate-600 dark:text-slate-300">{label}</p>
                  <p className="mt-1 text-3xl font-semibold text-sky-800 dark:text-sky-300">{value}</p>
                </article>
              ))}
            </div>
            <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-900">
                  <tr>
                    <th className="p-3 text-left">Requisition</th>
                    <th className="p-3 text-left">Client</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Scheduled</th>
                    <th className="p-3 text-right">In progress</th>
                    <th className="p-3 text-right">Completed</th>
                    <th className="p-3 text-right">Cancelled</th>
                    <th className="p-3 text-right">No show</th>
                    <th className="p-3 text-right">Pending feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.rows.map((row) => (
                    <tr key={row.requisition_id} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="p-3"><div className="font-medium">{row.requisition_id}</div><div className="text-slate-500">{row.title}</div></td>
                      <td className="p-3">{row.client_name || "--"}</td>
                      <td className="p-3 text-right font-semibold">{row.total}</td>
                      <td className="p-3 text-right">{row.scheduled}</td>
                      <td className="p-3 text-right">{row.in_progress}</td>
                      <td className="p-3 text-right">{row.completed}</td>
                      <td className="p-3 text-right">{row.cancelled}</td>
                      <td className="p-3 text-right">{row.no_show}</td>
                      <td className="p-3 text-right">{row.pending_feedback}</td>
                    </tr>
                  ))}
                  {monthly.rows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-500">No interviews found for this month.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
              <h4 className="border-b border-slate-200 bg-slate-100 p-3 font-semibold dark:border-slate-800 dark:bg-slate-900">
                Panel-wise Monthly Pivot
              </h4>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-950">
                  <tr>
                    <th className="p-3 text-left">Panel Member</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Scheduled</th>
                    <th className="p-3 text-right">In progress</th>
                    <th className="p-3 text-right">Completed</th>
                    <th className="p-3 text-right">Cancelled</th>
                    <th className="p-3 text-right">No show</th>
                    <th className="p-3 text-right">Pending feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.panel_rows.map((row) => (
                    <tr key={row.panel_sub} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="p-3"><div className="font-medium">{row.full_name || row.email || row.panel_sub}</div><div className="text-xs text-slate-500">{row.email}</div></td>
                      <td className="p-3">{row.panel_type || "--"}</td>
                      <td className="p-3 text-right font-semibold">{row.total}</td>
                      <td className="p-3 text-right">{row.scheduled}</td>
                      <td className="p-3 text-right">{row.in_progress}</td>
                      <td className="p-3 text-right">{row.completed}</td>
                      <td className="p-3 text-right">{row.cancelled}</td>
                      <td className="p-3 text-right">{row.no_show}</td>
                      <td className="p-3 text-right">{row.pending_feedback}</td>
                    </tr>
                  ))}
                  {monthly.panel_rows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-500">No panel assignments found for this month.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-sky-800 dark:text-sky-300">Date-based Interview Reports</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border p-2" aria-label="Daily report date" />
        <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="rounded border p-2" aria-label="Weekly report start date" />
        <button className="rounded bg-indigo-600 p-2 text-white" onClick={loadReports}>
          Load Daily and Weekly Reports
        </button>
      </div>
      {error && <p className="text-red-700">{error}</p>}
      {daily && (
        <section className="mt-4 space-y-2">
          <h3 className="font-semibold text-sky-800 dark:text-sky-300">Daily Scheduled Interviews ({daily.date})</h3>
          <p>Total scheduled: {daily.total_scheduled}</p>
          <div className="overflow-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-900">
                <tr>
                  <th className="p-2 text-left">Requisition</th>
                  <th className="p-2 text-left">Client</th>
                  <th className="p-2 text-left">Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {daily.by_requisition.map((row) => (
                  <tr key={row.requisition_id} className="border-t">
                    <td className="p-2">{row.requisition_id} - {row.title}</td>
                    <td className="p-2">{row.client_name || "--"}</td>
                    <td className="p-2">{row.scheduled_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {weekly && (
        <section className="mt-6 space-y-2">
          <h3 className="font-semibold text-sky-800 dark:text-sky-300">
            Weekly Requirement Report ({weekly.week_start} to {weekly.week_end_exclusive})
          </h3>
          <div className="overflow-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-900">
                <tr>
                  <th className="p-2 text-left">Requirement</th>
                  <th className="p-2 text-left">Client</th>
                  <th className="p-2 text-left">Req Status</th>
                  <th className="p-2 text-left">Positions</th>
                  <th className="p-2 text-left">Interviews (W)</th>
                  <th className="p-2 text-left">Scheduled</th>
                  <th className="p-2 text-left">Completed</th>
                  <th className="p-2 text-left">Cancelled</th>
                </tr>
              </thead>
              <tbody>
                {weekly.requirements.map((row) => (
                  <tr key={row.requisition_id} className="border-t">
                    <td className="p-2">{row.requisition_id} - {row.title}</td>
                    <td className="p-2">{row.client_name || "--"}</td>
                    <td className="p-2">{row.status || "--"}</td>
                    <td className="p-2">{row.positions_filled}/{row.positions_total} (open {row.positions_open})</td>
                    <td className="p-2">{row.interviews_total}</td>
                    <td className="p-2">{row.scheduled}</td>
                    <td className="p-2">{row.completed}</td>
                    <td className="p-2">{row.cancelled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      </section>
    </PageShell>
  );
}
