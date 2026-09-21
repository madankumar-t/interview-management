import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";
import type { OrganizationSettings } from "../types/domain";

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("422")) {
    return "Please provide a valid company name and support email address.";
  }
  if (message.startsWith("403")) {
    return "You are not authorized to manage organization settings.";
  }
  if (message.startsWith("401")) {
    return "Your session has expired. Please log in again.";
  }
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  return "Unable to load organization settings.";
}

export function SettingsPage() {
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .getOrganizationSettings()
      .then((data) => {
        setSettings(data);
        setCompanyName(data.company_name);
        setSupportEmail(data.support_email ?? "");
        setSupportPhone(data.support_phone ?? "");
        setLogoUrl(data.logo_url ?? "");
      })
      .catch((reason: unknown) => setError(describeError(reason)))
      .finally(() => setLoading(false));
  }, []);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.updateOrganizationSettings({
        company_name: companyName,
        support_email: supportEmail || null,
        support_phone: supportPhone || null,
        logo_url: logoUrl || null,
      });
      setSettings(updated);
      setMessage("Organization settings saved.");
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title="Settings">
      <div className="max-w-xl space-y-4">
        <div>
          <h3 className="font-semibold text-sky-800 dark:text-sky-300">Organization Branding</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This information is used to identify your organization to users of the application.
          </p>
        </div>

        {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        {message && !error && <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-700">{message}</p>}

        {loading ? (
          <p className="text-slate-400">Loading settings…</p>
        ) : (
          <form className="space-y-3" onSubmit={onSave}>
            <label className="block text-sm font-medium">
              Company name
              <input
                className="mt-1 w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
                maxLength={200}
              />
            </label>
            <label className="block text-sm font-medium">
              Support email
              <input
                type="email"
                className="mt-1 w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                value={supportEmail}
                onChange={(event) => setSupportEmail(event.target.value)}
                placeholder="support@example.com"
              />
            </label>
            <label className="block text-sm font-medium">
              Support phone
              <input
                className="mt-1 w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                value={supportPhone}
                onChange={(event) => setSupportPhone(event.target.value)}
                placeholder="+1 555 0100"
              />
            </label>
            <label className="block text-sm font-medium">
              Logo URL
              <input
                type="url"
                className="mt-1 w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </label>
            {logoUrl && (
              <div>
                <p className="mb-1 text-xs text-slate-500">Preview</p>
                <img src={logoUrl} alt="Organization logo preview" className="h-12 max-w-xs object-contain" />
              </div>
            )}
            <button
              type="submit"
              className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-40 hover:bg-indigo-700"
              disabled={saving || !companyName}
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
            {settings?.updated_at && (
              <p className="text-xs text-slate-500">Last updated {new Date(settings.updated_at).toLocaleString()}</p>
            )}
          </form>
        )}
      </div>
    </PageShell>
  );
}
