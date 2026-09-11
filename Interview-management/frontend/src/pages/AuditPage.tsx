import { useCallback, useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";
import type { AuditRecord } from "../types/domain";

function formatTimestamp(value: string): string {
  if (!value) {
    return "Not recorded";
  }
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
}

export function AuditPage() {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRecords(await api.listAudit());
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message.startsWith("403") ? "You are not authorized to view the audit log." : "Unable to load the audit log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  return (
    <PageShell title="Audit Log">
      {error && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded bg-red-50 p-3 text-red-700 dark:bg-red-950 dark:text-red-200">
          <span>{error}</span>
          <button className="rounded bg-red-700 px-3 py-1 text-white" onClick={() => void loadAudit()}>
            Retry
          </button>
        </div>
      )}
      <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-900">
            <tr>
              <th className="p-3 text-left">Date &amp; Time</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Entity</th>
              <th className="p-3 text-left">Logged-in User</th>
              <th className="p-3 text-left">Roles</th>
              <th className="p-3 text-left">Changes</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => (
              <tr key={`${record.at}-${record.entity_id}-${index}`} className="border-t border-slate-200 align-top dark:border-slate-800">
                <td className="whitespace-nowrap p-3">{formatTimestamp(record.at)}</td>
                <td className="p-3 font-medium capitalize">{record.action.replace(/_/g, " ")}</td>
                <td className="p-3">
                  <div className="capitalize">{record.entity}</div>
                  <div className="text-xs text-slate-500">{record.entity_id}</div>
                </td>
                <td className="p-3">
                  <div>{record.actor_email || "Email not recorded"}</div>
                  <div className="text-xs text-slate-500">{record.actor_sub}</div>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {record.actor_roles.length > 0 ? (
                      record.actor_roles.map((role) => (
                        <span key={role} className="rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                          {role}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500">Not recorded</span>
                    )}
                  </div>
                </td>
                <td className="max-w-sm p-3 text-slate-600 dark:text-slate-300">{record.changes || "-"}</td>
              </tr>
            ))}
            {!loading && !error && records.length === 0 && (
              <tr>
                <td className="p-8 text-center text-slate-500" colSpan={6}>No audit activity has been recorded.</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td className="p-8 text-center text-slate-500" colSpan={6}>Loading audit activity...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}