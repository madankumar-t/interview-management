import { FormEvent, useState } from "react";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("401")) return "Your session has expired. Please log in again.";
  if (message.startsWith("403")) return "You are not authorized to manage candidates.";
  return "Unable to load candidates. Please try again.";
}

export function CandidatesPage() {
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    try {
      await api.createCandidate({
        candidate_type: formData.get("candidate_type"),
        full_name: formData.get("full_name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        skills: String(formData.get("skills") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
        total_experience_years: Number(formData.get("total_experience_years") ?? 0),
        relevant_experience_years: Number(formData.get("relevant_experience_years") ?? 0),
        department: formData.get("department"),
        project: formData.get("project"),
        hiring_manager: formData.get("hiring_manager"),
        location: formData.get("location"),
        timezone: formData.get("timezone"),
        ta_owner_sub: formData.get("ta_owner_sub"),
      });
      setStatus("Candidate saved");
      form.reset();
    } catch (reason) {
      setError(describeError(reason));
    }
  }

  return (
    <PageShell title="Add Candidate">
      <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <select aria-label="Candidate Type" name="candidate_type" className="rounded border p-2">
          <option>Internal</option>
          <option>External</option>
        </select>
        <input name="full_name" className="rounded border p-2" placeholder="Full name" required />
        <input name="email" className="rounded border p-2" placeholder="Email" required />
        <input name="phone" className="rounded border p-2" placeholder="Phone" required />
        <input name="skills" className="rounded border p-2" placeholder="Skills (comma separated)" />
        <input name="total_experience_years" className="rounded border p-2" placeholder="Total experience" required />
        <input name="relevant_experience_years" className="rounded border p-2" placeholder="Relevant experience" required />
        <input name="department" className="rounded border p-2" placeholder="Department" required />
        <input name="project" className="rounded border p-2" placeholder="Project" required />
        <input name="hiring_manager" className="rounded border p-2" placeholder="Hiring manager" required />
        <input name="location" className="rounded border p-2" placeholder="Location" required />
        <input defaultValue="Asia/Kolkata" name="timezone" className="rounded border p-2" placeholder="Timezone" required />
        <input name="ta_owner_sub" className="rounded border p-2" placeholder="TA owner sub" required />
        <button className="rounded bg-indigo-600 p-2 text-white">Save Candidate</button>
      </form>
      {status && <p role="status" className="mt-3 text-sm text-emerald-700">{status}</p>}
      {error && <p role="alert" className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </PageShell>
  );
}

