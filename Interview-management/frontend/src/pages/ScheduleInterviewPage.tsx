import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { SearchSelect } from "../components/SearchSelect";
import { MultiSearchSelect } from "../components/MultiSearchSelect";
import { TagInput } from "../components/TagInput";
import { api } from "../lib/api";
import { detectTimezone, durationMinutes, formatDuration, localToUtcIso, timezoneOptions } from "../lib/datetime";
import type { CandidateSummary, Conflict, PanelMember, RequisitionSummary } from "../types/domain";

const STEPS = ["Candidate & Role", "Round & Panel", "Date, Availability & Location", "Review & Schedule"] as const;

const ROUND_TYPES = ["technical", "coding", "managerial", "HR", "client"];
const INTERVIEW_ROUNDS = ["Round 1", "Round 2", "Round 3", "Final"];

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("409")) {
    return "This slot conflicts with an existing reservation. Please choose a different time.";
  }
  if (message.startsWith("401")) {
    return "Your session has expired. Please log in again.";
  }
  if (message.startsWith("403")) {
    return "You are not authorized to schedule this interview.";
  }
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  return "Unable to schedule the interview. Please review the details and try again.";
}

export function ScheduleInterviewPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Step 1
  const [candidate, setCandidate] = useState<CandidateSummary | null>(null);
  const [requisition, setRequisition] = useState<RequisitionSummary | null>(null);

  // Step 2
  const [roundType, setRoundType] = useState(ROUND_TYPES[0]);
  const [interviewRound, setInterviewRound] = useState(INTERVIEW_ROUNDS[0]);
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [panelMembers, setPanelMembers] = useState<PanelMember[]>([]);
  const [leadPanelSub, setLeadPanelSub] = useState("");

  // Step 3
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [tz, setTz] = useState(detectTimezone());
  const [mode, setMode] = useState<"Online" | "In Person">("Online");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [venue, setVenue] = useState("");
  const [instructions, setInstructions] = useState("");

  // Step 4
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ interview_id: string; status: string } | null>(null);

  const tzOptions = useMemo(() => timezoneOptions(), []);
  const duration = durationMinutes(startTime, endTime);

  function stepIsValid(index: number): boolean {
    if (index === 0) {
      return Boolean(candidate && requisition);
    }
    if (index === 1) {
      return panelMembers.length > 0 && Boolean(leadPanelSub);
    }
    if (index === 2) {
      return Boolean(date) && duration > 0 && Boolean(tz) && (mode === "Online" ? Boolean(meetingUrl) : Boolean(venue));
    }
    return true;
  }

  async function goToReview() {
    setStep(3);
    setConflicts(null);
    if (!date || duration <= 0 || panelMembers.length === 0) {
      return;
    }
    setCheckingConflicts(true);
    try {
      const startUtc = localToUtcIso(date, startTime, tz);
      const endUtc = localToUtcIso(date, endTime, tz);
      const result = await api.checkConflicts(panelMembers.map((p) => p.sub), startUtc, endUtc);
      setConflicts(result.conflicts);
    } catch {
      setConflicts(null);
    } finally {
      setCheckingConflicts(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!candidate || !requisition) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const interview = (await api.scheduleInterview({
        candidate_id: candidate.candidate_id,
        requisition_id: requisition.requisition_id,
        round_name: roundType,
        interview_type: interviewRound,
        required_skills: requiredSkills,
        panel_subs: panelMembers.map((p) => p.sub),
        lead_panel_sub: leadPanelSub,
        start_local_iso: `${date}T${startTime}:00`,
        end_local_iso: `${date}T${endTime}:00`,
        timezone: tz,
        mode,
        meeting_url: mode === "Online" ? meetingUrl : undefined,
        venue: mode === "In Person" ? venue : undefined,
        instructions,
        evaluation_template: {},
        idempotency_key: crypto.randomUUID(),
      })) as { interview_id: string; status: string };
      setCreated(interview);
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <PageShell title="Schedule Interview">
        <div className="rounded border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <p className="font-semibold">Interview scheduled successfully.</p>
          <p>Interview ID: {created.interview_id}</p>
          <p>Status: {created.status}</p>
          <button
            type="button"
            className="mt-3 rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
            onClick={() => navigate("/interviews")}
          >
            Back to Interviews
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Schedule Interview">
      <ol className="mb-6 flex flex-wrap gap-2 text-sm">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 ${
              index === step
                ? "bg-indigo-600 text-white"
                : index < step
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {step === 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SearchSelect<CandidateSummary>
              label="Candidate"
              required
              placeholder="Search by name or email"
              value={candidate}
              onChange={setCandidate}
              fetchOptions={(q) => api.listCandidates({ q }).then((r) => r.candidates)}
              getOptionKey={(c) => c.candidate_id}
              getOptionLabel={(c) => c.full_name}
              renderOption={(c) => (
                <div>
                  <div className="font-medium">{c.full_name}</div>
                  <div className="text-xs text-slate-500">
                    {c.email} ·{" "}
                    <span
                      className={`rounded-full px-1.5 py-0.5 ${
                        c.candidate_type === "Internal"
                          ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                      }`}
                    >
                      {c.candidate_type}
                    </span>
                  </div>
                </div>
              )}
            />
            <SearchSelect<RequisitionSummary>
              label="Requirement"
              required
              placeholder="Search by title, requisition ID, or client"
              value={requisition}
              onChange={setRequisition}
              fetchOptions={(q) => api.listRequisitions({ q }).then((r) => r.requisitions)}
              getOptionKey={(r) => r.requisition_id}
              getOptionLabel={(r) => `${r.requisition_id} · ${r.title}`}
              renderOption={(r) => (
                <div>
                  <div className="font-medium">
                    {r.requisition_id} · {r.title}
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.client_name} / {r.project} · {r.positions_open} open position{r.positions_open === 1 ? "" : "s"}
                  </div>
                </div>
              )}
            />
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Round Type *</label>
              <select
                className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                value={roundType}
                onChange={(event) => setRoundType(event.target.value)}
              >
                {ROUND_TYPES.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Interview Round *</label>
              <select
                className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                value={interviewRound}
                onChange={(event) => setInterviewRound(event.target.value)}
              >
                {INTERVIEW_ROUNDS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <TagInput label="Required Skills" tags={requiredSkills} onChange={setRequiredSkills} />
            </div>
            <div className="md:col-span-2">
              <MultiSearchSelect<PanelMember>
                label="Panel Members"
                required
                placeholder="Search panel members by name"
                selected={panelMembers}
                onChange={(members) => {
                  setPanelMembers(members);
                  if (leadPanelSub && !members.some((m) => m.sub === leadPanelSub)) {
                    setLeadPanelSub("");
                  }
                }}
                fetchOptions={() => api.listPanelMembers().then((r) => r.panel_members)}
                getOptionKey={(p) => p.sub}
                getOptionLabel={(p) => p.email}
                renderOption={(p) => (
                  <div>
                    <div className="font-medium">{p.email}</div>
                    <div className="text-xs text-slate-500">
                      {p.skills.length > 0 ? p.skills.join(", ") : "No skills listed"} · {p.availability_slots} availability slot
                      {p.availability_slots === 1 ? "" : "s"} configured
                    </div>
                  </div>
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Lead Interviewer *</label>
              <select
                className="w-full rounded border border-slate-300 p-2 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
                value={leadPanelSub}
                disabled={panelMembers.length === 0}
                onChange={(event) => setLeadPanelSub(event.target.value)}
              >
                <option value="">Select a lead interviewer</option>
                {panelMembers.map((member) => (
                  <option key={member.sub} value={member.sub}>
                    {member.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Date *</label>
              <input
                type="date"
                className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Start Time *</label>
                <input
                  type="time"
                  className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">End Time *</label>
                <input
                  type="time"
                  className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  required
                />
              </div>
            </div>
            <SearchSelect<string>
              label="Timezone"
              required
              value={tz}
              onChange={(value) => setTz(value ?? detectTimezone())}
              fetchOptions={(q) => Promise.resolve(tzOptions.filter((option) => option.toLowerCase().includes(q.toLowerCase())).slice(0, 25))}
              getOptionKey={(option) => option}
              getOptionLabel={(option) => option}
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Mode *</label>
              <select
                className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                value={mode}
                onChange={(event) => setMode(event.target.value as "Online" | "In Person")}
              >
                <option>Online</option>
                <option>In Person</option>
              </select>
            </div>
            {mode === "Online" ? (
              <input
                className="rounded border border-slate-300 p-2 md:col-span-2 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Meeting URL"
                value={meetingUrl}
                onChange={(event) => setMeetingUrl(event.target.value)}
                required
              />
            ) : (
              <input
                className="rounded border border-slate-300 p-2 md:col-span-2 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Venue"
                value={venue}
                onChange={(event) => setVenue(event.target.value)}
                required
              />
            )}
            <textarea
              className="rounded border border-slate-300 p-2 md:col-span-2 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Instructions for candidate/panel (optional)"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="mb-2 font-semibold">Summary</h3>
              <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Candidate</dt>
                  <dd>{candidate?.full_name} ({candidate?.email})</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Requirement</dt>
                  <dd>{requisition?.requisition_id} · {requisition?.title}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Round</dt>
                  <dd>{roundType} — {interviewRound}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Panel</dt>
                  <dd>{panelMembers.map((p) => p.email).join(", ")}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Lead Interviewer</dt>
                  <dd>{panelMembers.find((p) => p.sub === leadPanelSub)?.email ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Date &amp; Time</dt>
                  <dd>
                    {date} {startTime}–{endTime} ({tz})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Duration</dt>
                  <dd>{formatDuration(duration)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Location</dt>
                  <dd>{mode === "Online" ? meetingUrl || "—" : venue || "—"}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="mb-2 font-semibold">Panel Availability</h3>
              {checkingConflicts && <p className="text-sm text-slate-500">Checking panel availability…</p>}
              {!checkingConflicts && conflicts === null && (
                <p className="text-sm text-slate-500">Availability could not be verified. You may still proceed.</p>
              )}
              {!checkingConflicts && conflicts !== null && conflicts.length === 0 && (
                <p className="text-sm text-emerald-700 dark:text-emerald-300">No conflicts detected for the selected panel members.</p>
              )}
              {!checkingConflicts && conflicts !== null && conflicts.length > 0 && (
                <ul className="space-y-1 text-sm text-red-700">
                  {conflicts.map((conflict) => (
                    <li key={conflict.interview_id}>
                      Conflict for {conflict.panel_subs.join(", ")} with an existing interview at{" "}
                      {new Date(conflict.start_utc).toLocaleString()}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-4 py-2 disabled:opacity-40 dark:border-slate-700"
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
          >
            Back
          </button>
          {step < 3 && (
            <button
              type="button"
              className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-40 hover:bg-indigo-700"
              disabled={!stepIsValid(step)}
              onClick={() => (step === 2 ? goToReview() : setStep((current) => current + 1))}
            >
              Next
            </button>
          )}
          {step === 3 && (
            <button
              type="submit"
              className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-40 hover:bg-indigo-700"
              disabled={submitting}
            >
              {submitting ? "Scheduling…" : "Schedule Interview"}
            </button>
          )}
        </div>
      </form>
    </PageShell>
  );
}
