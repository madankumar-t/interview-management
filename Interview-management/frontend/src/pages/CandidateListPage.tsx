import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";
import type { CandidateSummary } from "../types/domain";

const PAGE_SIZE = 10;

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("401")) return "Your session has expired. Please log in again.";
  if (message.startsWith("403")) return "You are not authorized to manage candidates.";
  return "Unable to load candidates. Please try again.";
}

export function CandidateListPage() {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [query, setQuery] = useState("");
  const [candidateType, setCandidateType] = useState("");
  const [lifecycle, setLifecycle] = useState("active");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.listCandidates({ q: query, candidateType, lifecycle, page, pageSize: PAGE_SIZE });
      setCandidates(result.candidates);
      setTotal(result.total);
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setLoading(false);
    }
  }, [candidateType, lifecycle, page, query]);

  useEffect(() => { void load(); }, [load]);

  async function toggleStatus(candidate: CandidateSummary) {
    try {
      await api.updateCandidateStatus(candidate.candidate_id, candidate.status === "Closed" ? "Active" : "Closed");
      await load();
    } catch (reason) {
      setError(describeError(reason));
    }
  }

  function resetPage() { setPage(1); }

  return (
    <PageShell title="Candidate List">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <input className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="Search name or email" value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} />
          <select aria-label="Candidate type" className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" value={candidateType} onChange={(event) => { setCandidateType(event.target.value); resetPage(); }}>
            <option value="">All types</option><option>Internal</option><option>External</option>
          </select>
          <select aria-label="Candidate lifecycle" className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" value={lifecycle} onChange={(event) => { setLifecycle(event.target.value); resetPage(); }}>
            <option value="active">Active</option><option value="closed">Closed</option><option value="all">All</option>
          </select>
        </div>
        <Link to="/candidates/new" className="rounded bg-indigo-600 px-4 py-2 text-white">Add Candidate</Link>
      </div>
      {error && <p role="alert" className="mb-3 rounded bg-red-50 p-3 text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded border dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-900"><tr><th className="p-3 text-left">Candidate</th><th className="p-3 text-left">Contact</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Scope</th><th className="p-3 text-left">Status</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading candidates...</td></tr> : candidates.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">No candidates found.</td></tr> : candidates.map((candidate) => (
              <tr key={candidate.candidate_id} className="border-t align-top dark:border-slate-800">
                <td className="p-3"><div className="font-medium">{candidate.full_name}</div><div className="text-xs text-slate-500">{candidate.candidate_id}</div></td>
                <td className="p-3"><div>{candidate.email}</div><div className="text-slate-500">{candidate.phone}</div></td>
                <td className="p-3">{candidate.candidate_type}</td><td className="p-3">{candidate.department} / {candidate.project}</td>
                <td className="p-3"><button type="button" className={`rounded px-3 py-1 text-white ${candidate.status === "Closed" ? "bg-emerald-700" : "bg-slate-700"}`} onClick={() => void toggleStatus(candidate)}>{candidate.status === "Closed" ? "Reopen" : "Close"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span>{total === 0 ? "0 records" : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total}`}</span>
        <div className="flex items-center gap-2"><button className="rounded border px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button className="rounded border px-3 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div>
      </div>
    </PageShell>
  );
}
