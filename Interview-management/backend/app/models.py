from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class Role(str, Enum):
    ADMINISTRATOR = "Administrator"
    MANAGER = "Manager"
    TA = "TA"
    PANEL = "Panel"


class InterviewStatus(str, Enum):
    SCHEDULED = "Scheduled"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"
    NO_SHOW = "No Show"


class FeedbackStatus(str, Enum):
    NOT_STARTED = "Not Started"
    DRAFT = "Draft"
    SUBMITTED = "Submitted"


class CandidateType(str, Enum):
    INTERNAL = "Internal"
    EXTERNAL = "External"


class CandidateStatus(str, Enum):
    ACTIVE = "Active"
    CLOSED = "Closed"


class PanelType(str, Enum):
    INTERNAL = "Internal"
    EXTERNAL = "External"


class PanelStatus(str, Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"


class RequisitionStatus(str, Enum):
    INTAKE_RECEIVED = "Intake Received"
    INTAKE_REVIEW = "Intake Review"
    APPROVED = "Approved"
    OPEN = "Open"
    SOURCING = "Sourcing"
    INTERVIEWING = "Interviewing"
    OFFER = "Offer"
    FILLED = "Filled"
    ON_HOLD = "On Hold"
    CANCELLED = "Cancelled"
    CLOSED = "Closed"


class AuthContext(BaseModel):
    sub: str
    email: str | None = None
    groups: set[Role] = Field(default_factory=set)
    token_use: str = "access"
    authz_version: int | None = None


class ErrorResponse(BaseModel):
    code: str
    message: str
    correlation_id: str


class CandidateUpsertRequest(BaseModel):
    candidate_type: CandidateType
    full_name: str
    email: str
    phone: str
    skills: list[str] = Field(default_factory=list)
    total_experience_years: float
    relevant_experience_years: float
    department: str
    project: str
    hiring_manager: str
    location: str
    timezone: str
    ta_owner_sub: str
    notes: str | None = None
    employee_id: str | None = None
    current_department: str | None = None
    current_project: str | None = None
    current_manager: str | None = None
    release_date: str | None = None
    current_organization: str | None = None
    notice_period_days: int | None = None
    source: str | None = None
    resume_s3_key: str | None = None


class CandidateStatusUpdateRequest(BaseModel):
    status: CandidateStatus


class PanelCreateRequest(BaseModel):
    full_name: str = Field(min_length=1)
    email: str = Field(min_length=3)
    phone: str | None = None
    panel_type: PanelType
    technologies: list[str] = Field(min_length=1)
    experience_years: float = Field(ge=0)
    designation: str | None = None
    organization: str | None = None


class PanelStatusUpdateRequest(BaseModel):
    status: PanelStatus


class RequisitionUpsertRequest(BaseModel):
    requisition_id: str
    title: str
    requirement_summary: str | None = None
    department: str
    project: str
    hiring_manager_sub: str
    required_skills: list[str] = Field(default_factory=list)
    status: RequisitionStatus = RequisitionStatus.INTAKE_RECEIVED
    intake_received_at_utc: str
    intake_source: str | None = None
    target_start_date: str | None = None
    priority: str = "Medium"
    positions_total: int = Field(ge=1)
    positions_filled: int = Field(default=0, ge=0)
    client_name: str
    client_account_id: str | None = None
    client_contact_name: str | None = None
    client_contact_email: str | None = None
    client_contact_phone: str | None = None
    client_location: str | None = None
    billing_type: str | None = None
    sla_days: int | None = Field(default=None, ge=0)
    notes: str | None = None

    @model_validator(mode="after")
    def validate_position_counts(self) -> "RequisitionUpsertRequest":
        if self.positions_filled > self.positions_total:
            raise ValueError("positions_filled cannot exceed positions_total")
        return self


class RequisitionStatusUpdateRequest(BaseModel):
    status: RequisitionStatus


class ScheduleInterviewRequest(BaseModel):
    candidate_id: str
    requisition_id: str
    round_name: str
    interview_type: str
    required_skills: list[str] = Field(default_factory=list)
    panel_subs: list[str]
    lead_panel_sub: str
    start_local_iso: str
    end_local_iso: str
    timezone: str
    mode: str
    meeting_url: str | None = None
    venue: str | None = None
    instructions: str | None = None
    evaluation_template: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str

    @model_validator(mode="after")
    def validate_panels(self) -> "ScheduleInterviewRequest":
        if len(self.panel_subs) == 0:
            raise ValueError("At least one panel member is required")
        if self.lead_panel_sub not in self.panel_subs:
            raise ValueError("Lead panel must be part of panel_subs")
        return self


class RescheduleInterviewRequest(BaseModel):
    start_local_iso: str
    end_local_iso: str
    timezone: str
    reason: str
    idempotency_key: str
    expected_version: int


class CancelInterviewRequest(BaseModel):
    reason: str
    idempotency_key: str
    expected_version: int


class FeedbackUpsertRequest(BaseModel):
    interview_id: str
    competency_scores: dict[str, int]
    strengths: str
    improvement_areas: str
    recommendation: str
    comments: str


class FeedbackSubmitRequest(BaseModel):
    interview_id: str


class AdminCreateUserRequest(BaseModel):
    email: str
    full_name: str | None = None
    groups: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_groups(self) -> "AdminCreateUserRequest":
        if not self.groups:
            raise ValueError("At least one role is required")
        valid = {role.value for role in Role}
        invalid = [group for group in self.groups if group not in valid]
        if invalid:
            raise ValueError(f"Invalid roles: {invalid}")
        return self


class AdminUpdateGroupsRequest(BaseModel):
    groups: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_groups(self) -> "AdminUpdateGroupsRequest":
        if not self.groups:
            raise ValueError("At least one role is required")
        valid = {role.value for role in Role}
        invalid = [group for group in self.groups if group not in valid]
        if invalid:
            raise ValueError(f"Invalid roles: {invalid}")
        return self


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
