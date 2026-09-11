import { FormEvent, useState } from "react";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";

const REQUISITION_STATUSES = [
  "Intake Received", "Intake Review", "Approved", "Open", "Sourcing", "Interviewing",
  "Offer", "Filled", "On Hold", "Cancelled", "Closed",
];

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("401")) return "Your session has expired. Please log in again.";
  if (message.startsWith("403")) return "You are not authorized to manage requisitions.";
  if (message.startsWith("404")) return "The requisition no longer exists.";
  return "Unable to load requisitions. Please try again.";
}

export function RequisitionsPage() {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    try {
      await api.createRequisition({
      requisition_id: formData.get("requisition_id"),
      title: formData.get("title"),
      department: formData.get("department"),
      project: formData.get("project"),
      hiring_manager_sub: formData.get("hiring_manager_sub"),
      requirement_summary: formData.get("requirement_summary"),
      required_skills: String(formData.get("required_skills") ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      status: formData.get("status"),
      intake_received_at_utc: formData.get("intake_received_at_utc"),
      intake_source: formData.get("intake_source"),
      target_start_date: formData.get("target_start_date"),
      priority: formData.get("priority"),
      positions_total: Number(formData.get("positions_total") ?? 1),
      positions_filled: Number(formData.get("positions_filled") ?? 0),
      client_name: formData.get("client_name"),
      client_account_id: formData.get("client_account_id"),
      client_contact_name: formData.get("client_contact_name"),
      client_contact_email: formData.get("client_contact_email"),
      client_contact_phone: formData.get("client_contact_phone"),
      client_location: formData.get("client_location"),
      billing_type: formData.get("billing_type"),
      sla_days: Number(formData.get("sla_days") ?? 0),
      notes: formData.get("notes"),
      });
      setStatus("Requisition saved");
      form.reset();
    } catch (reason) {
      setError(describeError(reason));
    }
  }
  return (
    <PageShell title="Add Requisition">
      <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <input name="requisition_id" className="rounded border p-2" placeholder="REQ-001" required />
        <input name="title" className="rounded border p-2" placeholder="Role title" required />
        <input name="requirement_summary" className="rounded border p-2 md:col-span-2" placeholder="Requirement summary" />
        <input name="department" className="rounded border p-2" placeholder="Department" required />
        <input name="project" className="rounded border p-2" placeholder="Project" required />
        <input name="hiring_manager_sub" className="rounded border p-2" placeholder="Manager sub" required />
        <select name="status" className="rounded border p-2" defaultValue="Intake Received">
          {REQUISITION_STATUSES.map((value) => <option key={value}>{value}</option>)}
        </select>
        <input
          name="intake_received_at_utc"
          className="rounded border p-2"
          defaultValue={new Date().toISOString()}
          placeholder="Intake time in UTC"
          required
        />
        <input name="intake_source" className="rounded border p-2" placeholder="Intake source (email/referral/client call)" />
        <input name="target_start_date" className="rounded border p-2" placeholder="Target start date (YYYY-MM-DD)" />
        <select name="priority" className="rounded border p-2" defaultValue="Medium">
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <input name="positions_total" type="number" min={1} className="rounded border p-2" placeholder="Total positions" defaultValue={1} required />
        <input name="positions_filled" type="number" min={0} className="rounded border p-2" placeholder="Filled positions" defaultValue={0} required />
        <input name="client_name" className="rounded border p-2" placeholder="Client name" required />
        <input name="client_account_id" className="rounded border p-2" placeholder="Client account ID" />
        <input name="client_contact_name" className="rounded border p-2" placeholder="Client contact name" />
        <input name="client_contact_email" className="rounded border p-2" placeholder="Client contact email" />
        <input name="client_contact_phone" className="rounded border p-2" placeholder="Client contact phone" />
        <input name="client_location" className="rounded border p-2" placeholder="Client location/timezone" />
        <input name="billing_type" className="rounded border p-2" placeholder="Billing type (T&M / Fixed / Internal)" />
        <input name="sla_days" type="number" min={0} className="rounded border p-2" placeholder="SLA days" defaultValue={0} />
        <input name="required_skills" className="rounded border p-2" placeholder="Skills comma separated" />
        <textarea name="notes" className="rounded border p-2 md:col-span-2" placeholder="Notes" />
        <button className="rounded bg-indigo-600 p-2 text-white">Save Requisition</button>
      </form>
      {status && <p role="status" className="mt-3 text-sm text-emerald-700">{status}</p>}
      {error && <p role="alert" className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </PageShell>
  );
}
