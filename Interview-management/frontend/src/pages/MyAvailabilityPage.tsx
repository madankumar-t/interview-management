import { FormEvent, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { PageShell } from "../components/PageShell";
import { SearchSelect } from "../components/SearchSelect";
import { api } from "../lib/api";
import {
  detectTimezone,
  durationMinutes,
  localToUtcIso,
  timezoneOptions,
  utcToLocalDate,
  utcToLocalTime,
} from "../lib/datetime";
import type { AvailabilitySlot } from "../types/domain";

interface EditableSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

function newSlot(): EditableSlot {
  return {
    id: crypto.randomUUID(),
    date: dayjs().add(1, "day").format("YYYY-MM-DD"),
    startTime: "09:00",
    endTime: "17:00",
  };
}

function describeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.startsWith("401")) return "Your session has expired. Please log in again.";
  if (message.startsWith("403")) return "You are not authorized to manage availability.";
  if (message.startsWith("422")) return "Availability slots are invalid or overlap. Please review the times.";
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  return "Unable to save availability. Please try again.";
}

export function MyAvailabilityPage() {
  const [timezone, setTimezone] = useState(detectTimezone());
  const [slots, setSlots] = useState<EditableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const timezoneChoices = useMemo(() => timezoneOptions(), []);

  useEffect(() => {
    let active = true;
    api
      .getMyAvailability()
      .then((response) => {
        if (!active) return;
        const initialTimezone = response.availability[0]?.timezone || detectTimezone();
        setTimezone(initialTimezone);
        setSlots(
          response.availability.map((slot) => ({
            id: crypto.randomUUID(),
            date: utcToLocalDate(slot.start_utc, slot.timezone),
            startTime: utcToLocalTime(slot.start_utc, slot.timezone),
            endTime: utcToLocalTime(slot.end_utc, slot.timezone),
          })),
        );
      })
      .catch((reason: unknown) => {
        if (active) setError(describeError(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function updateSlot(id: string, field: keyof Omit<EditableSlot, "id">, value: string) {
    setSlots((current) => current.map((slot) => (slot.id === id ? { ...slot, [field]: value } : slot)));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (slots.some((slot) => !slot.date || durationMinutes(slot.startTime, slot.endTime) <= 0)) {
      setError("Each availability slot must have an end time after its start time.");
      return;
    }
    const payload: AvailabilitySlot[] = slots.map((slot) => ({
      start_utc: localToUtcIso(slot.date, slot.startTime, timezone),
      end_utc: localToUtcIso(slot.date, slot.endTime, timezone),
      timezone,
    }));
    setSaving(true);
    try {
      await api.updateMyAvailability(payload);
      setMessage("Availability saved. TA schedulers can now use these time windows.");
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title="My Availability">
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
        Add the date and time windows when you are available to conduct interviews. Interviews can only be assigned
        inside one of these windows.
      </p>

      {loading && <p className="text-slate-500">Loading availability…</p>}
      {!loading && (
        <form className="space-y-4" onSubmit={save}>
          {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
          {message && <p className="rounded bg-emerald-50 p-3 text-emerald-700">{message}</p>}

          <div className="max-w-md">
            <SearchSelect<string>
              label="Timezone"
              required
              value={timezone}
              onChange={(value) => setTimezone(value ?? detectTimezone())}
              fetchOptions={(query) =>
                Promise.resolve(
                  timezoneChoices.filter((option) => option.toLowerCase().includes(query.toLowerCase())).slice(0, 25),
                )
              }
              getOptionKey={(option) => option}
              getOptionLabel={(option) => option}
            />
          </div>

          <div className="space-y-3">
            {slots.map((slot) => (
              <div
                key={slot.id}
                className="grid grid-cols-1 gap-3 rounded border border-slate-200 p-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end dark:border-slate-800"
              >
                <label className="text-sm font-medium">
                  Date
                  <input
                    type="date"
                    min={dayjs().format("YYYY-MM-DD")}
                    className="mt-1 block w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                    value={slot.date}
                    onChange={(event) => updateSlot(slot.id, "date", event.target.value)}
                    required
                  />
                </label>
                <label className="text-sm font-medium">
                  Start
                  <input
                    type="time"
                    className="mt-1 block w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                    value={slot.startTime}
                    onChange={(event) => updateSlot(slot.id, "startTime", event.target.value)}
                    required
                  />
                </label>
                <label className="text-sm font-medium">
                  End
                  <input
                    type="time"
                    className="mt-1 block w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
                    value={slot.endTime}
                    onChange={(event) => updateSlot(slot.id, "endTime", event.target.value)}
                    required
                  />
                </label>
                <button
                  type="button"
                  className="rounded border border-red-300 px-3 py-2 text-red-700 hover:bg-red-50"
                  onClick={() => setSlots((current) => current.filter((item) => item.id !== slot.id))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {slots.length === 0 && (
            <p className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No availability windows added. You will be shown as unavailable for interview assignment.
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 px-4 py-2 dark:border-slate-700"
              onClick={() => setSlots((current) => [...current, newSlot()])}
            >
              Add Availability
            </button>
            <button
              type="submit"
              className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50 hover:bg-indigo-700"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Availability"}
            </button>
          </div>
        </form>
      )}
    </PageShell>
  );
}
