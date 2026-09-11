import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { TagInput } from "../components/TagInput";
import { api } from "../lib/api";
import type { PanelMember } from "../types/domain";

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("401")) return "Your session has expired. Please log in again.";
  if (message.startsWith("403")) return "You are not authorized to manage panels.";
  if (message.startsWith("422")) return "Check the panel details and add at least one technology.";
  return "Unable to complete the panel request. Please try again.";
}

export function PanelsPage() {
  const [panels, setPanels] = useState<PanelMember[]>([]);
  const [technologies, setTechnologies] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [technologyFilter, setTechnologyFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.listPanelMembers({ q: query, technology: technologyFilter, panelType: typeFilter, includeInactive });
      setPanels(result.panel_members);
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setLoading(false);
    }
  }, [includeInactive, query, technologyFilter, typeFilter]);

  useEffect(() => { void load(); }, [load]);

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
      await load();
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(panel: PanelMember) {
    setError("");
    try {
      const active = panel.status === "Active" || panel.status === "ACTIVE";
      await api.updatePanelStatus(panel.panel_id || panel.sub, active ? "Inactive" : "Active");
      await load();
    } catch (reason) {
      setError(describeError(reason));
    }
  }

  return (
    <PageShell title="Panel Management">
      <section className="mb-8 border-b border-slate-200 pb-8 dark:border-slate-800">
        <h3 className="mb-4 text-lg font-semibold">Add Panel Member</h3>
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

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Panel Roster</h3>
          <div className="flex flex-wrap gap-2">
            <input className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="Search name or email" value={query} onChange={(event) => setQuery(event.target.value)} />
            <input className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" placeholder="Filter technology" value={technologyFilter} onChange={(event) => setTechnologyFilter(event.target.value)} />
            <select aria-label="Panel type filter" className="rounded border p-2 dark:border-slate-700 dark:bg-slate-900" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">All types</option><option>Internal</option><option>External</option>
            </select>
            <label className="flex items-center gap-2 rounded border px-3 dark:border-slate-700"><input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />Show inactive</label>
          </div>
        </div>
        <div className="overflow-x-auto rounded border dark:border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-900"><tr><th className="p-3 text-left">Panel Member</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Technology</th><th className="p-3 text-left">Experience</th><th className="p-3 text-left">Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading panel members...</td></tr> : panels.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">No panel members found.</td></tr> : panels.map((panel) => {
                const active = panel.status === "Active" || panel.status === "ACTIVE";
                return <tr key={panel.sub} className="border-t align-top dark:border-slate-800">
                  <td className="p-3"><div className="font-medium">{panel.full_name || panel.email}</div><div>{panel.email}</div><div className="text-xs text-slate-500">{panel.designation}{panel.organization ? ` · ${panel.organization}` : ""}</div></td>
                  <td className="p-3">{panel.panel_type}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-1">{panel.skills.map((skill) => <span key={skill} className="rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200">{skill}</span>)}</div></td>
                  <td className="p-3">{panel.experience_years} years</td>
                  <td className="p-3"><button type="button" className={`rounded px-3 py-1 text-white ${active ? "bg-slate-700" : "bg-emerald-700"}`} onClick={() => void toggleStatus(panel)}>{active ? "Deactivate" : "Activate"}</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}
