import { FormEvent, useState } from "react";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";
import type { Interview } from "../types/domain";

export function InterviewsPage() {
  const [created, setCreated] = useState<Interview | null>(null);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    try {
      const interview = (await api.scheduleInterview({
        candidate_id: formData.get("candidate_id"),
        requisition_id: formData.get("requisition_id"),
        round_name: formData.get("round_name"),
        interview_type: formData.get("interview_type"),
        required_skills: String(formData.get("required_skills") ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        panel_subs: String(formData.get("panel_subs") ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        lead_panel_sub: formData.get("lead_panel_sub"),
        start_local_iso: formData.get("start_local_iso"),
        end_local_iso: formData.get("end_local_iso"),
        timezone: formData.get("timezone"),
        mode: formData.get("mode"),
        meeting_url: formData.get("meeting_url"),
        venue: formData.get("venue"),
        instructions: formData.get("instructions"),
        evaluation_template: {},
        idempotency_key: crypto.randomUUID(),
      })) as Interview;
      setCreated(interview);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <PageShell title="Interviews">
      <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <input name="candidate_id" className="rounded border p-2" placeholder="Candidate ID" required />
        <input name="requisition_id" className="rounded border p-2" placeholder="Requisition ID" required />
        <select name="round_name" className="rounded border p-2">
          <option>technical</option>
          <option>coding</option>
          <option>managerial</option>
          <option>HR</option>
          <option>client</option>
        </select>
        <input name="interview_type" className="rounded border p-2" placeholder="Interview type" defaultValue="Round 1" />
        <input name="required_skills" className="rounded border p-2" placeholder="Required skills" />
        <input name="panel_subs" className="rounded border p-2" placeholder="panel1,panel2" required />
        <input name="lead_panel_sub" className="rounded border p-2" placeholder="Lead panel sub" required />
        <input name="start_local_iso" className="rounded border p-2" placeholder="2026-12-10T10:00:00+05:30" required />
        <input name="end_local_iso" className="rounded border p-2" placeholder="2026-12-10T11:00:00+05:30" required />
        <input defaultValue="Asia/Kolkata" name="timezone" className="rounded border p-2" required />
        <select name="mode" className="rounded border p-2">
          <option>Online</option>
          <option>In Person</option>
        </select>
        <input name="meeting_url" className="rounded border p-2" placeholder="Meeting URL" />
        <input name="venue" className="rounded border p-2" placeholder="Venue" />
        <textarea name="instructions" className="rounded border p-2 md:col-span-2" placeholder="Instructions" />
        <button className="rounded bg-indigo-600 p-2 text-white">Schedule</button>
      </form>
      {error && <p className="text-red-700">{error}</p>}
      {created && (
        <div className="rounded border p-3">
          <p>Interview created: {created.interview_id}</p>
          <p>Status: {created.status}</p>
          <p>Version: {created.version}</p>
        </div>
      )}
    </PageShell>
  );
}

