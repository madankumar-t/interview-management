import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";
import type { UserSession } from "../types/auth";
import type { FeedbackRecord, InterviewListItem } from "../types/domain";

type FeedbackReviewItem = InterviewListItem & { feedback: FeedbackRecord[] };
const PANEL_INTERVIEWED_STATUSES = new Set([
  "Completed",
  "L1 Completed",
  "L2 Completed",
  "Client Round Completed",
  "Rejected",
]);

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("401")) return "Your session has expired. Please log in again.";
  if (message.startsWith("403")) return "You are not authorized to view candidate feedback.";
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  return "Unable to load candidate feedback.";
}

function isClientRound(item: InterviewListItem): boolean {
  return `${item.round_name} ${item.interview_type}`.toLowerCase().includes("client");
}

export function FeedbackOverviewPage({ session }: { session: UserSession }) {
  const hasBroadAccess = session.groups.some((role) => role === "Administrator" || role === "Manager" || role === "TA");
  const canExport = session.groups.some((role) => role === "Administrator" || role === "Manager" || role === "TA");
  const panelOnly = session.groups.includes("Panel") && !hasBroadAccess;
  const [items, setItems] = useState<FeedbackReviewItem[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [round, setRound] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.listInterviews({ mineOnly: panelOnly })
      .then(async ({ interviews }) => Promise.all(interviews
        .filter((interview) => !panelOnly || PANEL_INTERVIEWED_STATUSES.has(interview.status))
        .map(async (interview) => ({
        ...interview,
        feedback: (await api.getFeedbackForInterview(interview.interview_id))
          .filter((record) => record.status === "Submitted"),
      }))))
      .then((records) => {
        if (active) setItems(records);
      })
      .catch((reason: unknown) => {
        if (active) {
          setItems([]);
          setError(describeError(reason));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [panelOnly, retryToken]);

  const rounds = useMemo(
    () => [...new Set(items.map((item) => item.round_name).filter(Boolean))].sort(),
    [items],
  );
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !needle || `${item.candidate_name} ${item.client_name} ${item.requisition_title} ${item.round_name}`
        .toLowerCase().includes(needle);
      return matchesQuery && (!round || item.round_name === round) && (!status || item.status === status);
    });
  }, [items, query, round, status]);
  const selectedItems = useMemo(
    () => items.filter((item) => selectedCandidateIds.has(item.candidate_id)),
    [items, selectedCandidateIds],
  );
  const selectedCandidateGroups = useMemo(() => {
    const groups = new Map<string, FeedbackReviewItem[]>();
    for (const item of selectedItems) {
      const candidateItems = groups.get(item.candidate_id) ?? [];
      candidateItems.push(item);
      groups.set(item.candidate_id, candidateItems);
    }
    return [...groups.entries()];
  }, [selectedItems]);
  const visibleCandidateIds = [...new Set(visibleItems.map((item) => item.candidate_id))];
  const allVisibleSelected = visibleCandidateIds.length > 0
    && visibleCandidateIds.every((candidateId) => selectedCandidateIds.has(candidateId));

  function toggleCandidate(candidateId: string) {
    setSelectedCandidateIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  function toggleVisibleCandidates() {
    setSelectedCandidateIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleCandidateIds.forEach((candidateId) => next.delete(candidateId));
      else visibleCandidateIds.forEach((candidateId) => next.add(candidateId));
      return next;
    });
  }

  async function downloadExcel() {
    setExporting(true);
    try {
      const rows = selectedItems.flatMap((item) => {
        const feedbackRows = item.feedback.length > 0 ? item.feedback : [null];
        return feedbackRows.map((record) => ({
          Candidate: item.candidate_name || "Unknown candidate",
          Client: item.client_name || "",
          Requirement: item.requisition_title || item.requisition_id,
          Round: item.round_name || "Interview",
          "Interview Type": item.interview_type,
          "Interview Date": dayjs(item.start_utc).format("YYYY-MM-DD HH:mm"),
          "Interview Status": item.status,
          "Panel Recommendation": record?.recommendation ?? "",
          "Competency Scores": record ? Object.entries(record.competency_scores)
            .map(([name, score]) => `${name}: ${score}/5`).join("; ") : "",
          Strengths: record?.strengths ?? "",
          "Areas for Improvement": record?.improvement_areas ?? "",
          Comments: record?.comments ?? "",
        }));
      });
      const headers = Object.keys(rows[0] ?? {
        Candidate: "",
        Client: "",
        Requirement: "",
        Round: "",
        "Interview Type": "",
        "Interview Date": "",
        "Interview Status": "",
        "Panel Recommendation": "",
        "Competency Scores": "",
        Strengths: "",
        "Areas for Improvement": "",
        Comments: "",
      });
      const escapeCell = (value: unknown) => {
        const text = String(value ?? "");
        const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
        return `"${safeText.replace(/"/g, '""')}"`;
      };
      const csv = [headers, ...rows.map((row) => headers.map((header) => row[header as keyof typeof row]))]
        .map((row) => row.map(escapeCell).join(","))
        .join("\r\n");
      const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `selected-candidate-feedback-${selectedCandidateIds.size}-${dayjs().format("YYYY-MM-DD")}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function downloadPdf() {
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "pt", format: "letter" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 44;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const addText = (text: string, options: { size?: number; bold?: boolean; gap?: number } = {}) => {
        const size = options.size ?? 10;
        pdf.setFont("helvetica", options.bold ? "bold" : "normal");
        pdf.setFontSize(size);
        const lines = pdf.splitTextToSize(text, contentWidth) as string[];
        const lineHeight = size * 1.35;
        for (const line of lines) {
          if (y + lineHeight > pageHeight - margin) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += lineHeight;
        }
        y += options.gap ?? 3;
      };

      addText("Candidate Feedback Report", { size: 18, bold: true, gap: 5 });
      addText(`Generated ${dayjs().format("MMM D, YYYY HH:mm")}`, { size: 9, gap: 12 });
      for (const item of selectedItems) {
        addText(item.candidate_name || "Unknown candidate", { size: 13, bold: true, gap: 2 });
        addText(`Client: ${item.client_name || "Not specified"} | Requirement: ${item.requisition_title || item.requisition_id}`);
        addText(`Round: ${item.round_name || "Interview"} | Type: ${item.interview_type} | Date: ${dayjs(item.start_utc).format("YYYY-MM-DD HH:mm")} | Status: ${item.status}`, { gap: 5 });
        if (item.feedback.length === 0) {
          addText("Panel feedback: No submitted feedback", { gap: 8 });
        } else {
          item.feedback.forEach((record, index) => {
            addText(`Panel evaluation ${index + 1}: ${record.recommendation}`, { bold: true, gap: 2 });
            const scores = Object.entries(record.competency_scores)
              .map(([name, score]) => `${name}: ${score}/5`).join("; ");
            if (scores) addText(`Competency scores: ${scores}`);
            addText(`Strengths: ${record.strengths || "Not provided"}`);
            addText(`Areas for improvement: ${record.improvement_areas || "Not provided"}`);
            if (record.comments) addText(`Comments: ${record.comments}`);
            y += 5;
          });
        }
        y += 8;
      }

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `candidate-feedback-${selectedCandidateIds.size}-candidates-${dayjs().format("YYYY-MM-DD")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <PageShell title="Candidate Feedback">
      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(16rem,1fr)_12rem_12rem]">
        <input
          className="rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
          aria-label="Search candidate feedback"
          placeholder="Search candidate, client, or requirement"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
          aria-label="Filter by round"
          value={round}
          onChange={(event) => setRound(event.target.value)}
        >
          <option value="">All rounds</option>
          {rounds.map((name) => <option key={name}>{name}</option>)}
        </select>
        <select
          className="rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
          aria-label="Filter by interview status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All interview statuses</option>
          {[...new Set(items.map((item) => item.status))].sort().map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded bg-red-50 p-3 text-red-700">
          <span>{error}</span>
          <button type="button" className="rounded bg-red-700 px-3 py-1 text-sm text-white" onClick={() => setRetryToken((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
        <span>{visibleItems.length} interview rounds</span>
        <div className="flex flex-wrap items-center gap-3">
          <span>{selectedCandidateIds.size} candidates selected</span>
          <span>{items.reduce((total, item) => total + item.feedback.length, 0)} submitted panel evaluations</span>
          {canExport && (
            <>
            <button
              type="button"
              className="rounded bg-sky-800 px-3 py-2 font-medium text-white hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading || exporting || Boolean(error) || selectedItems.length === 0}
              onClick={downloadExcel}
            >
              Download Selected CSV
            </button>
            <button
              type="button"
              className="rounded border border-sky-800 px-3 py-2 font-medium text-sky-900 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-200 dark:hover:bg-slate-800"
              disabled={loading || exporting || Boolean(error) || selectedItems.length === 0}
              onClick={downloadPdf}
            >
              {exporting ? "Preparing download…" : "Download Selected PDF"}
            </button>
            </>
          )}
        </div>
      </div>

      {selectedCandidateGroups.length > 0 && (
        <section aria-label="Selected candidates report preview" className="mb-4 border-y border-sky-200 py-4 dark:border-sky-900">
          <h3 className="mb-3 text-base font-semibold text-sky-900 dark:text-sky-200">
            Selected feedback report preview ({selectedCandidateGroups.length} {selectedCandidateGroups.length === 1 ? "candidate" : "candidates"})
          </h3>
          <div className="space-y-4">
            {selectedCandidateGroups.map(([candidateId, candidateItems]) => (
              <article key={candidateId}>
                <h4 className="font-semibold">{candidateItems[0].candidate_name || "Unknown candidate"}</h4>
                <div className="mt-2 space-y-3 border-l-2 border-sky-200 pl-3 dark:border-sky-800">
                  {candidateItems.map((item) => (
                    <div key={item.interview_id}>
                      <p className="font-medium">
                        {item.round_name || "Interview"} · {item.status} · {dayjs(item.start_utc).format("MMM D, YYYY")}
                      </p>
                      {item.feedback.length === 0 ? (
                        <p className="mt-1 text-sm text-slate-500">No submitted feedback</p>
                      ) : (
                        item.feedback.map((record, index) => (
                          <div key={`${record.author_sub}-${record.interview_id}`} className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            <p>Panel evaluation {index + 1}: {record.recommendation}</p>
                            {record.strengths && <p>Strengths: {record.strengths}</p>}
                            {record.improvement_areas && <p>Areas for improvement: {record.improvement_areas}</p>}
                            {record.comments && <p>Comments: {record.comments}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-100 dark:bg-slate-900">
            <tr>
              <th className="p-3">
                <input
                  type="checkbox"
                  aria-label="Select all visible candidates"
                  checked={allVisibleSelected}
                  disabled={loading || visibleCandidateIds.length === 0}
                  onChange={toggleVisibleCandidates}
                />
              </th>
              <th className="p-3">Candidate</th>
              <th className="p-3">Client / Requirement</th>
              <th className="p-3">Round</th>
              <th className="p-3">Interview</th>
              <th className="p-3">Panel feedback</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="p-6 text-center text-slate-500" colSpan={6}>Loading candidate feedback…</td></tr>}
            {!loading && error && <tr><td className="p-6 text-center text-red-700" colSpan={6}>Unable to load candidate feedback.</td></tr>}
            {!loading && !error && visibleItems.length === 0 && (
              <tr><td className="p-6 text-center text-slate-500" colSpan={6}>No interview rounds match these filters.</td></tr>
            )}
            {!loading && !error && visibleItems.map((item) => (
              <tr key={item.interview_id} className="border-t border-slate-200 align-top dark:border-slate-800">
                <td className="p-3">
                  <input
                    type="checkbox"
                    aria-label={`Select feedback for ${item.candidate_name || "Unknown candidate"}`}
                    checked={selectedCandidateIds.has(item.candidate_id)}
                    onChange={() => toggleCandidate(item.candidate_id)}
                  />
                </td>
                <td className="p-3 font-medium">{item.candidate_name || "Unknown candidate"}</td>
                <td className="p-3">
                  <p>{item.client_name || "Client not specified"}</p>
                  <p className="text-xs text-slate-500">{item.requisition_title || item.requisition_id}</p>
                </td>
                <td className="p-3">
                  <p>{item.round_name || "Interview"}</p>
                  {isClientRound(item) && <span className="mt-1 inline-block rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200">Client round</span>}
                </td>
                <td className="p-3">
                  <p>{dayjs(item.start_utc).format("MMM D, YYYY · HH:mm")}</p>
                  <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${item.status === "Rejected" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>
                    {item.status}
                  </p>
                </td>
                <td className="p-3">
                  {item.feedback.length === 0 ? (
                    <span className="text-slate-500">No submitted feedback</span>
                  ) : (
                    <details>
                      <summary className="cursor-pointer font-medium text-sky-700 dark:text-sky-300">
                        View {item.feedback.length} {item.feedback.length === 1 ? "evaluation" : "evaluations"}
                      </summary>
                      <div className="mt-3 min-w-64 space-y-3">
                        {item.feedback.map((record, index) => (
                          <article key={`${record.author_sub}-${record.interview_id}`} className="border-l-2 border-sky-300 pl-3 dark:border-sky-700">
                            <p className="font-medium">Panel evaluation {index + 1}: {record.recommendation}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {Object.entries(record.competency_scores).map(([name, score]) => `${name}: ${score}/5`).join(" · ")}
                            </p>
                            <p className="mt-2"><span className="font-medium">Strengths:</span> {record.strengths || "Not provided"}</p>
                            <p className="mt-1"><span className="font-medium">Areas to improve:</span> {record.improvement_areas || "Not provided"}</p>
                            {record.comments && <p className="mt-1"><span className="font-medium">Comments:</span> {record.comments}</p>}
                          </article>
                        ))}
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}