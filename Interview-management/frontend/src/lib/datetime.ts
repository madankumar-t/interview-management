import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export function localToUtcIso(date: string, time: string, tz: string): string {
  return dayjs.tz(`${date}T${time}`, tz).utc().toISOString();
}

export function detectTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function timezoneOptions(): string[] {
  const globalIntl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    if (typeof globalIntl.supportedValuesOf === "function") {
      return globalIntl.supportedValuesOf("timeZone");
    }
  } catch {
    // Older browsers do not support Intl.supportedValuesOf; fall back below.
  }
  return [
    "Asia/Kolkata",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Singapore",
    "Asia/Dubai",
    "Asia/Tokyo",
    "Australia/Sydney",
    "UTC",
  ];
}

export function durationMinutes(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return endHour * 60 + endMinute - (startHour * 60 + startMinute);
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) {
    return "—";
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours === 0) {
    return `${remaining}m`;
  }
  return remaining === 0 ? `${hours}h` : `${hours}h ${remaining}m`;
}
