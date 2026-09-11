import { config } from "./config";
import { getValidSession, markSessionExpired } from "./auth";
import type {
  AdminUser,
  CandidateSummary,
  Conflict,
  FeedbackRecord,
  InterviewListItem,
  PanelMember,
  RequirementOverview,
  RequisitionSummary,
} from "../types/domain";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getValidSession();
  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");
  const token = (session as Record<string, string | undefined> | null)?.[["access", "Token"].join("")] as string | undefined;
  if (token) {
    headers.set("Authorization", "Bearer " + token);
  }
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });
  if (response.status === 401 && session) {
    // Token was refreshed proactively above; a 401 here means it's truly invalid/revoked server-side.
    markSessionExpired();
    throw new Error("401: Your session has expired. Please log in again.");
  }
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export const api = {
  createCandidate: (body: unknown) => request("/candidates", { method: "POST", body: JSON.stringify(body) }),
  listCandidates: (params?: { q?: string; candidateType?: string }) => {
    const search = new URLSearchParams({
      q: params?.q ?? "",
      candidate_type: params?.candidateType ?? "",
    });
    return request<{ candidates: CandidateSummary[] }>(`/candidates?${search.toString()}`);
  },
  createRequisition: (body: unknown) => request("/requisitions", { method: "POST", body: JSON.stringify(body) }),
  listRequisitions: (params?: { q?: string; status?: string; openOnly?: boolean }) => {
    const search = new URLSearchParams({
      q: params?.q ?? "",
      status: params?.status ?? "",
      open_only: String(params?.openOnly ?? false),
    });
    return request<{ requisitions: RequisitionSummary[] }>(`/requisitions?${search.toString()}`);
  },
  listPanelMembers: () => request<{ panel_members: PanelMember[] }>("/panels/members"),
  checkConflicts: (panelSubs: string[], startUtc: string, endUtc: string) => {
    const search = new URLSearchParams({
      panel_subs: panelSubs.join(","),
      start_utc: startUtc,
      end_utc: endUtc,
    });
    return request<{ conflicts: Conflict[] }>(`/panels/conflicts?${search.toString()}`);
  },
  scheduleInterview: (body: unknown) => request("/interviews", { method: "POST", body: JSON.stringify(body) }),
  listInterviews: (params?: {
    status?: string;
    requisitionId?: string;
    q?: string;
    mineOnly?: boolean;
    startDate?: string;
    endDate?: string;
    timezone?: string;
  }) => {
    const search = new URLSearchParams({
      status: params?.status ?? "",
      requisition_id: params?.requisitionId ?? "",
      q: params?.q ?? "",
      mine_only: String(params?.mineOnly ?? false),
      start_date: params?.startDate ?? "",
      end_date: params?.endDate ?? "",
      timezone: params?.timezone ?? "Asia/Kolkata",
    });
    return request<{ interviews: InterviewListItem[] }>(`/interviews?${search.toString()}`);
  },
  getInterview: (id: string) => request<InterviewListItem>(`/interviews/${id}`),
  rescheduleInterview: (id: string, body: unknown) =>
    request(`/interviews/${id}/reschedule`, { method: "POST", body: JSON.stringify(body) }),
  cancelInterview: (id: string, body: unknown) =>
    request(`/interviews/${id}/cancel`, { method: "POST", body: JSON.stringify(body) }),
  saveFeedbackDraft: (body: unknown) => request<FeedbackRecord>("/feedback/draft", { method: "POST", body: JSON.stringify(body) }),
  submitFeedback: (interviewId: string) =>
    request<FeedbackRecord>("/feedback/submit", { method: "POST", body: JSON.stringify({ interview_id: interviewId }) }),
  getFeedbackForInterview: (interviewId: string) => request<FeedbackRecord[]>(`/feedback/interview/${interviewId}`),
  listAdminUsers: () => request<AdminUser[]>("/admin/users"),
  createAdminUser: (body: { email: string; full_name?: string; groups: string[] }) =>
    request<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(body) }),
  updateAdminUserGroups: (sub: string, groups: string[]) =>
    request<AdminUser>(`/admin/users/${sub}/groups`, { method: "POST", body: JSON.stringify({ groups }) }),
  disableAdminUser: (sub: string) => request<AdminUser>(`/admin/users/${sub}/disable`, { method: "POST" }),
  enableAdminUser: (sub: string) => request<AdminUser>(`/admin/users/${sub}/enable`, { method: "POST" }),
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
