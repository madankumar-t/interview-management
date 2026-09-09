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
