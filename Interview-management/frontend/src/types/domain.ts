export interface Candidate {
  candidate_id: string;
  full_name: string;
  email: string;
  department: string;
  project: string;
  candidate_type: "Internal" | "External";
}

export interface Requisition {
  requisition_id: string;
  title: string;
  department: string;
  project: string;
  status: string;
  intake_received_at_utc: string;
  positions_total: number;
  positions_filled: number;
  positions_open: number;
  client_name: string;
}

export interface Interview {
  interview_id: string;
  candidate_id: string;
  requisition_id: string;
  department: string;
  project: string;
  panel_subs: string[];
  lead_panel_sub: string;
  round_name: string;
  interview_type: string;
  mode: string;
  meeting_url: string | null;
  venue: string | null;
  instructions: string | null;
  start_utc: string;
  end_utc: string;
  timezone: string;
  status: string;
  version: number;
}

export interface RequirementReportRow extends Requisition {
  interviews_total: number;
  scheduled: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  no_show: number;
  pending_feedback: number;
}

export interface RequirementOverview {
  generated_at: string;
  timezone: string;
  summary: {
    total_requirements: number;
    open_requirements: number;
    open_positions: number;
    clients: number;
    today_interviews: number;
    upcoming_interviews: number;
    pending_feedback: number;
  };
  filters: {
    requisitions: string[];
    clients: string[];
    statuses: string[];
  };
  requirements: RequirementReportRow[];
}

export interface CandidateSummary {
  candidate_id: string;
  full_name: string;
  email: string;
  phone: string;
  candidate_type: "Internal" | "External";
  status: "Active" | "Closed";
  department: string;
  project: string;
}

export interface RequisitionSummary {
  requisition_id: string;
  title: string;
  client_name: string;
  status: string;
  positions_total: number;
  positions_filled: number;
  positions_open: number;
  department: string;
  project: string;
}

export interface PanelMember {
  panel_id: string;
  sub: string;
  login_sub: string;
  full_name: string;
  email: string;
  phone: string;
  panel_type: "Internal" | "External";
  skills: string[];
  experience_years: number;
  designation: string;
  organization: string;
  status: "Active" | "Inactive" | "ACTIVE";
  availability_slots: number;
}

export interface InterviewListItem extends Interview {
  requisition_title: string;
  client_name: string;
  candidate_name: string;
}

export interface Conflict {
  panel_subs: string[];
  interview_id: string;
  start_utc: string;
  end_utc: string;
}

export interface AvailabilitySlot {
  start_utc: string;
  end_utc: string;
  timezone: string;
}

export interface ConflictCheck {
  conflicts: Conflict[];
  unavailable_panel_subs: string[];
}

export interface PanelReportRow {
  panel_id: string;
  sub: string;
  full_name: string;
  email: string;
  panel_type: "Internal" | "External";
  status: string;
  availability_slots: number;
  interviews_total: number;
  scheduled: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  no_show: number;
  pending_feedback: number;
}

export interface PanelReport {
  generated_at: string;
  summary: Record<"Internal" | "External", {
    panels: number;
    interviews: number;
    completed: number;
    pending_feedback: number;
  }>;
  panels: PanelReportRow[];
}

export interface FeedbackRecord {
  interview_id: string;
  competency_scores: Record<string, number>;
  strengths: string;
  improvement_areas: string;
  recommendation: string;
  comments: string;
  author_sub: string;
  status: "Draft" | "Submitted";
}

export interface AdminUser {
  sub: string;
  email: string;
  full_name?: string;
  groups: string[];
  status: "ACTIVE" | "DISABLED";
  authz_version: number;
}

export interface AuditRecord {
  at: string;
  entity: string;
  entity_id: string;
  action: string;
  actor_sub: string;
  actor_email: string;
  actor_roles: string[];
  changes: string;
}
