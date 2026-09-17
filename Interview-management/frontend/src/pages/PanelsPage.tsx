import { FormEvent, useState } from "react";
import { PageShell } from "../components/PageShell";
import { TagInput } from "../components/TagInput";
import { api } from "../lib/api";

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("401")) return "Your session has expired. Please log in again.";
  if (message.startsWith("403")) return "You are not authorized to manage panels.";
  if (message.startsWith("422")) return "Check the panel details and add at least one technology.";
  return "Unable to complete the panel request. Please try again.";
}

export function PanelsPage() {
  const [technologies, setTechnologies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function createPanel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.createPanel({
        full_name: data.get("full_name"),
        email: data.get("email"),
        phone: data.get("phone") || null,
        panel_type: data.get("panel_type"),
        technologies,
        experience_years: Number(data.get("experience_years")),
        designation: data.get("designation") || null,
        organization: data.get("organization") || null,
      });
      setMessage("Panel member added and available for interview scheduling.");
      form.reset();
      setTechnologies([]);
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title="Add Panel Member">
      <section>
        {error && <p role="alert" className="mb-3 rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
        {message && <p role="status" className="mb-3 rounded bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}
        <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={createPanel}>
          <input name="full_name" className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="Full name" required />
          <input name="email" type="email" className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="Email address" required />
          <input name="phone" className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="Phone (optional)" />
          <select name="panel_type" className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" defaultValue="Internal">
            <option>Internal</option><option>External</option>
          </select>
          <p className="text-sm text-slate-500 md:col-span-2">Internal panel email must match an active User Management account with the Panel role. External panels cannot sign in or submit feedback.</p>
          <input name="experience_years" type="number" min="0" step="0.5" className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="Years of experience" required />
          <input name="designation" className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="Designation (optional)" />
          <input name="organization" className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="Organization / business unit" />
          <div className="md:col-span-2"><TagInput label="Technologies" tags={technologies} onChange={setTechnologies} /></div>
          <button type="submit" className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-40 md:w-fit" disabled={saving || technologies.length === 0}>
            {saving ? "Adding..." : "Add Panel Member"}
          </button>
        </form>
      </section>
    </PageShell>
  );
}
