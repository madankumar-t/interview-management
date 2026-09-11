import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";
import type { RequisitionSummary } from "../types/domain";

const PAGE_SIZE = 10;
const STATUSES = ["Intake Received", "Intake Review", "Approved", "Open", "Sourcing", "Interviewing", "Offer", "Filled", "On Hold", "Cancelled", "Closed"];

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("401")) return "Your session has expired. Please log in again.";
  if (message.startsWith("403")) return "You are not authorized to manage requisitions.";
  return "Unable to load requisitions. Please try again.";
}

function Row({ requisition, reload }: { requisition: RequisitionSummary; reload: () => Promise<void> }) {
  const [status, setStatus] = useState(requisition.status);
  const [saving, setSaving] = useState(false);
  useEffect(() => setStatus(requisition.status), [requisition.status]);
  async function save() { setSaving(true); try { await api.updateRequisitionStatus(requisition.requisition_id, status); await reload(); } finally { setSaving(false); } }
  return <tr className="border-t align-top dark:border-slate-800">
    <td className="p-3"><div className="font-medium">{requisition.requisition_id}</div><div>{requisition.title}</div></td>
    <td className="p-3"><div>{requisition.client_name}</div><div className="text-slate-500">{requisition.department} / {requisition.project}</div></td>
    <td className="p-3">{requisition.positions_open} open / {requisition.positions_total} total</td>
    <td className="p-3"><div className="flex min-w-56 gap-2"><select className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" value={status} onChange={(event) => setStatus(event.target.value)}>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select><button className="rounded bg-indigo-600 px-3 text-white disabled:opacity-40" disabled={saving || status === requisition.status} onClick={() => void save()}>{saving ? "Saving..." : "Update"}</button></div></td>
  </tr>;
}

export function RequisitionListPage() {
  const [items, setItems] = useState<RequisitionSummary[]>([]);
  const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [lifecycle, setLifecycle] = useState("active");
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const load = useCallback(async () => { setLoading(true); setError(""); try { const result = await api.listRequisitions({ q: query, status, lifecycle, page, pageSize: PAGE_SIZE }); setItems(result.requisitions); setTotal(result.total); } catch (reason) { setError(describeError(reason)); } finally { setLoading(false); } }, [lifecycle, page, query, status]);
  useEffect(() => { void load(); }, [load]);
  function firstPage() { setPage(1); }
  return <PageShell title="Requisition List">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">
      <input className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="Search ID, title, or client" value={query} onChange={(event) => { setQuery(event.target.value); firstPage(); }} />
      <select aria-label="Requisition status" className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" value={status} onChange={(event) => { setStatus(event.target.value); firstPage(); }}><option value="">All statuses</option>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Requisition lifecycle" className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" value={lifecycle} onChange={(event) => { setLifecycle(event.target.value); firstPage(); }}><option value="active">Active</option><option value="closed">Closed / Cancelled / Filled</option><option value="all">All</option></select>
    </div><Link to="/requisitions/new" className="rounded bg-indigo-600 px-4 py-2 text-white">Add Requisition</Link></div>
    {error && <p role="alert" className="mb-3 rounded bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="overflow-x-auto rounded border dark:border-slate-800"><table className="min-w-full text-sm"><thead className="bg-slate-100 dark:bg-slate-900"><tr><th className="p-3 text-left">Requisition</th><th className="p-3 text-left">Client / Scope</th><th className="p-3 text-left">Positions</th><th className="p-3 text-left">Status</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={4} className="p-8 text-center text-slate-500">Loading requisitions...</td></tr> : items.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-slate-500">No requisitions found.</td></tr> : items.map((item) => <Row key={item.requisition_id} requisition={item} reload={load} />)}
    </tbody></table></div>
    <div className="mt-4 flex items-center justify-between text-sm"><span>{total === 0 ? "0 records" : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total}`}</span><div className="flex items-center gap-2"><button className="rounded border px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button className="rounded border px-3 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
  </PageShell>;
}
