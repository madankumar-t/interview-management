import { config } from "./config";
import { getSession } from "./auth";
import type { RequirementOverview } from "../types/domain";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = getSession();
  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export const api = {
  createCandidate: (body: unknown) => request("/candidates", { method: "POST", body: JSON.stringify(body) }),
  createRequisition: (body: unknown) => request("/requisitions", { method: "POST", body: JSON.stringify(body) }),
  scheduleInterview: (body: unknown) => request("/interviews", { method: "POST", body: JSON.stringify(body) }),
  getInterview: (id: string) => request(`/interviews/${id}`),
  getDailyInterviewsReport: (date: string, timezone = "Asia/Kolkata") =>
    request(`/reports/daily-interviews?date=${encodeURIComponent(date)}&timezone=${encodeURIComponent(timezone)}`),
  getWeeklyRequirementReport: (weekStart: string, timezone = "Asia/Kolkata") =>
    request(`/reports/weekly-requirement?week_start=${encodeURIComponent(weekStart)}&timezone=${encodeURIComponent(timezone)}`),
  getRequirementOverview: (filters?: {
    requisitionId?: string;
    clientName?: string;
    status?: string;
    openOnly?: boolean;
    timezone?: string;
  }) => {
    const params = new URLSearchParams({
      requisition_id: filters?.requisitionId ?? "",
      client_name: filters?.clientName ?? "",
      status: filters?.status ?? "",
      open_only: String(filters?.openOnly ?? false),
      timezone: filters?.timezone ?? "Asia/Kolkata",
    });
    return request<RequirementOverview>(`/reports/overview?${params.toString()}`);
  },
  health: () => request("/health"),
};
