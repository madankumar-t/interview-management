import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";
import type { UserSession } from "../types/auth";
import type { FeedbackRecord, InterviewListItem } from "../types/domain";

const COMPETENCIES = ["Technical", "Communication", "Problem Solving", "Culture Fit"];
const RECOMMENDATIONS = ["Strong Hire", "Hire", "No Hire", "Strong No Hire"];

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("409")) {
    return "This feedback has already been submitted and is locked.";
  }
  if (message.startsWith("401")) {
    return "Your session has expired. Please log in again.";
  }
  if (message.startsWith("403")) {
    return "You are not authorized to submit feedback for this interview.";
  }
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  return "Unable to save feedback. Please try again.";
}

export function FeedbackPage({ session }: { session: UserSession }) {
  const { interviewId = "" } = useParams();
  const navigate = useNavigate();

  const [interview, setInterview] = useState<InterviewListItem | null>(null);
  const [scores, setScores] = useState<Record<string, number>>(Object.fromEntries(COMPETENCIES.map((c) => [c, 3])));
  const [strengths, setStrengths] = useState("");
  const [improvementAreas, setImprovementAreas] = useState("");
  const [recommendation, setRecommendation] = useState(RECOMMENDATIONS[1]);
  const [comments, setComments] = useState("");
  const [status, setStatus] = useState<"Draft" | "Submitted" | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api.getInterview(interviewId).catch(() => null),
      api.getFeedbackForInterview(interviewId).catch(() => [] as FeedbackRecord[]),
    ]).then(([interviewRecord, records]) => {
      if (!active) {
        return;
      }
      setInterview(interviewRecord as InterviewListItem | null);
      const mine = records.find((record) => record.author_sub === session.sub);
      if (mine) {
        setScores(mine.competency_scores);
        setStrengths(mine.strengths);
        setImprovementAreas(mine.improvement_areas);
        setRecommendation(mine.recommendation);
        setComments(mine.comments);
        setStatus(mine.status);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [interviewId, session.sub]);

  function buildPayload() {
    return {
      interview_id: interviewId,
      competency_scores: scores,
      strengths,
      improvement_areas: improvementAreas,
      recommendation,
      comments,
    };
  }

  async function onSaveDraft(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.saveFeedbackDraft(buildPayload());
      setStatus("Draft");
      setMessage("Draft saved.");
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.saveFeedbackDraft(buildPayload());
      await api.submitFeedback(interviewId);
      setStatus("Submitted");
      setMessage("Feedback submitted.");
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSaving(false);
    }
  }

  const locked = status === "Submitted";

  return (
    <PageShell title="Submit Feedback">
      {loading && <p className="text-slate-500">Loading…</p>}
      {!loading && (
        <div className="space-y-4">
          {interview && (
            <div className="rounded border border-slate-200 p-3 text-sm dark:border-slate-800">
              <p className="font-medium">{interview.round_name} — {interview.interview_type}</p>
              <p className="text-slate-500">{new Date(interview.start_utc).toLocaleString()}</p>
            </div>
          )}

          {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
          {message && !error && <p className="rounded bg-emerald-50 p-3 text-emerald-700">{message}</p>}
          {locked && <p className="rounded bg-slate-100 p-3 text-slate-600 dark:bg-slate-900">This feedback has been submitted and is locked.</p>}

          <form className="space-y-4" onSubmit={onSaveDraft}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {COMPETENCIES.map((competency) => (
                <div key={competency}>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{competency}</label>
                  <select
                    className="w-full rounded border border-slate-300 p-2 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
                    value={scores[competency]}
                    disabled={locked}
                    onChange={(event) => setScores((current) => ({ ...current, [competency]: Number(event.target.value) }))}
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <textarea
              className="w-full rounded border border-slate-300 p-2 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Strengths"
              value={strengths}
              disabled={locked}
              onChange={(event) => setStrengths(event.target.value)}
              required
            />
            <textarea
              className="w-full rounded border border-slate-300 p-2 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Areas for improvement"
              value={improvementAreas}
              disabled={locked}
              onChange={(event) => setImprovementAreas(event.target.value)}
              required
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Recommendation</label>
              <select
                className="w-full rounded border border-slate-300 p-2 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
                value={recommendation}
                disabled={locked}
                onChange={(event) => setRecommendation(event.target.value)}
              >
                {RECOMMENDATIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
            <textarea
              className="w-full rounded border border-slate-300 p-2 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Additional comments"
              value={comments}
              disabled={locked}
              onChange={(event) => setComments(event.target.value)}
            />
            <div className="flex gap-2">
              <button type="button" className="rounded border border-slate-300 px-4 py-2 dark:border-slate-700" onClick={() => navigate("/my-schedule")}>
                Back
              </button>
              <button type="submit" className="rounded bg-slate-700 px-4 py-2 text-white disabled:opacity-40 hover:bg-slate-800" disabled={saving || locked}>
                Save Draft
              </button>
              <button
                type="button"
                className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-40 hover:bg-indigo-700"
                disabled={saving || locked || !strengths || !improvementAreas}
                onClick={onSubmit}
              >
                Submit Feedback
              </button>
            </div>
          </form>
          <p className="text-xs text-slate-500">
            Looking for another interview? <Link to="/my-schedule" className="text-indigo-600 underline">Back to My Schedule</Link>
          </p>
        </div>
      )}
    </PageShell>
  );
}
