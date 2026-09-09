import { useMemo, useState } from "react";
import { PageShell } from "../components/PageShell";
import { RequirementReport } from "../components/RequirementReport";
import { api } from "../lib/api";

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

export function ReportsPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [weekStart, setWeekStart] = useState(today);
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

  return (
    <PageShell title="Reports">
      <section className="mb-8 space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-sky-800 dark:text-sky-300">Requirement Status Report</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">Live totals across clients, requirements, positions, interviews, and feedback.</p>
        </div>
        <RequirementReport />
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
