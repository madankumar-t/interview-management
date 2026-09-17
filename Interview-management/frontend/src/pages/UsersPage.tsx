import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";
import type { AdminUser } from "../types/domain";

const ALL_ROLES = ["Administrator", "Manager", "TA", "Panel"];

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("409")) {
    if (/disabled user/i.test(message)) {
      return "Enable this user before requesting a password reset.";
    }
    return "Cannot complete this action: at least one active administrator is required.";
  }
  if (message.startsWith("400")) {
    if (/password/i.test(message)) {
      return "Cognito could not start the password reset. Verify the user account and try again.";
    }
    return "Unable to create user. Check the email address and try again.";
  }
  if (message.startsWith("401")) {
    return "Your session has expired. Please log in again.";
  }
  if (message.startsWith("403")) {
    return "You are not authorized to manage users.";
  }
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  return "Unable to load users.";
}

function RoleCheckboxes({ selected, onChange }: { selected: string[]; onChange: (roles: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {ALL_ROLES.map((role) => (
        <label key={role} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(role)}
            onChange={(event) => {
              onChange(event.target.checked ? [...selected, role] : selected.filter((r) => r !== role));
            }}
          />
          {role}
        </label>
      ))}
    </div>
  );
}

function UserRow({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [groups, setGroups] = useState<string[]>(user.groups);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function saveGroups() {
    setSaving(true);
    setError("");
    try {
      await api.updateAdminUserGroups(user.sub, groups);
      setEditing(false);
      onChanged();
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    setSaving(true);
    setError("");
    try {
      if (user.status === "ACTIVE") {
        await api.disableAdminUser(user.sub);
      } else {
        await api.enableAdminUser(user.sub);
      }
      onChanged();
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.resetAdminUserPassword(user.sub);
      setMessage(`Password reset instructions sent to ${user.email}.`);
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-t border-slate-200 dark:border-slate-800 align-top">
      <td className="p-3">
        <div className="font-medium">{user.email}</div>
        {user.full_name && <div className="text-slate-500">{user.full_name}</div>}
      </td>
      <td className="p-3">
        {editing ? (
          <RoleCheckboxes selected={groups} onChange={setGroups} />
        ) : (
          <div className="flex flex-wrap gap-1">
            {user.groups.map((group) => (
              <span key={group} className="rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                {group}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="p-3">
        <span
          className={`rounded-full px-2 py-1 text-xs ${
            user.status === "ACTIVE"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          {user.status}
        </span>
      </td>
      <td className="p-3">
        {error && <p className="mb-1 text-xs text-red-700">{error}</p>}
        {message && !error && <p className="mb-1 text-xs text-emerald-700">{message}</p>}
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button
                type="button"
                className="rounded bg-indigo-600 px-3 py-1 text-sm text-white disabled:opacity-40 hover:bg-indigo-700"
                disabled={saving || groups.length === 0}
                onClick={saveGroups}
              >
                Save Roles
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
                onClick={() => {
                  setGroups(user.groups);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-700" onClick={() => setEditing(true)}>
              Edit Roles
            </button>
          )}
          <button
            type="button"
            className="rounded border border-amber-500 px-3 py-1 text-sm text-amber-800 disabled:opacity-40 dark:text-amber-300"
            disabled={saving || user.status !== "ACTIVE"}
            onClick={resetPassword}
          >
            Reset Password
          </button>
          <button
            type="button"
            className={`rounded px-3 py-1 text-sm text-white disabled:opacity-40 ${
              user.status === "ACTIVE" ? "bg-red-700 hover:bg-red-800" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
            disabled={saving}
            onClick={toggleStatus}
          >
            {user.status === "ACTIVE" ? "Disable" : "Enable"}
          </button>
        </div>
      </td>
    </tr>
  );
}

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [newRoles, setNewRoles] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createMessage, setCreateMessage] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .listAdminUsers()
      .then(setUsers)
      .catch((reason: unknown) => {
        setUsers(null);
        setError(describeError(reason));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load, retryToken]);

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    setCreateMessage("");
    try {
      await api.createAdminUser({ email, full_name: fullName || undefined, groups: newRoles });
      setCreateMessage(`Invitation sent to ${email}.`);
      setEmail("");
      setFullName("");
      setNewRoles([]);
      setRetryToken((c) => c + 1);
    } catch (reason) {
      setCreateError(describeError(reason));
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageShell title="User Management">
      <div className="mb-6 rounded border border-slate-200 p-4 dark:border-slate-800">
        <h3 className="mb-3 font-semibold">Invite User</h3>
        {createError && <p role="alert" className="mb-2 rounded bg-red-50 p-2 text-sm text-red-700">{createError}</p>}
        {createMessage && !createError && <p className="mb-2 rounded bg-emerald-50 p-2 text-sm text-emerald-700">{createMessage}</p>}
        <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={onInvite}>
          <input
            className="rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
            placeholder="Email address"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            className="rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
            placeholder="Full name (optional)"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
          <div className="flex items-center">
            <RoleCheckboxes selected={newRoles} onChange={setNewRoles} />
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-40 hover:bg-indigo-700"
              disabled={creating || newRoles.length === 0 || !email}
            >
              {creating ? "Inviting…" : "Invite User"}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded bg-red-50 p-3 text-red-700">
          <span>{error}</span>
          <button type="button" className="shrink-0 rounded bg-red-700 px-3 py-1 text-sm text-white hover:bg-red-800" onClick={() => setRetryToken((c) => c + 1)}>
            Retry
          </button>
        </div>
      )}

      <div className="overflow-auto rounded border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-900">
            <tr>
              <th className="p-3 text-left">User</th>
              <th className="p-3 text-left">Roles</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-6 text-center text-slate-400" colSpan={4}>
                  Loading users…
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td className="p-6 text-center text-red-700" colSpan={4}>
                  Unable to load users.
                </td>
              </tr>
            )}
            {!loading && !error && users?.length === 0 && (
              <tr>
                <td className="p-6 text-center text-slate-500" colSpan={4}>
                  No users found.
                </td>
              </tr>
            )}
            {!loading && !error && users?.map((user) => <UserRow key={user.sub} user={user} onChanged={() => setRetryToken((c) => c + 1)} />)}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
