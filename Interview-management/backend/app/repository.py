from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import boto3
from botocore.exceptions import ClientError

from app.config import settings
from app.models import InterviewStatus, utc_now_iso


class ConflictError(Exception):
    pass


class AuthorizationStateError(Exception):
    pass


def parse_local_to_utc(local_iso: str, tz_name: str) -> datetime:
    dt = datetime.fromisoformat(local_iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo(tz_name))
    return dt.astimezone(timezone.utc)


def slot_keys(start_utc: datetime, end_utc: datetime) -> list[str]:
    slot_minutes = settings.reservation_slot_minutes
    cursor = start_utc
    keys: list[str] = []
    while cursor < end_utc:
        keys.append(cursor.strftime("%Y%m%d%H%M"))
        cursor += timedelta(minutes=slot_minutes)
    return keys


@dataclass
class SchedulePayload:
    interview_id: str
    candidate_id: str
    requisition_id: str
    department: str
    project: str
    panel_subs: list[str]
    lead_panel_sub: str
    start_utc: str
    end_utc: str
    timezone: str
    round_name: str
    interview_type: str
    mode: str
    meeting_url: str | None
    venue: str | None
    instructions: str | None
    required_skills: list[str]
    actor_sub: str
    idempotency_key: str


class DynamoRepository:
    def __init__(self) -> None:
        self.client = boto3.client("dynamodb", region_name=settings.aws_region)
        self.table_name = settings.table_name

    def _put_audit(self, tx_items: list[dict[str, Any]], entity: str, entity_id: str, action: str, actor_sub: str, changes: str) -> None:
        tx_items.append(
            {
                "Put": {
                    "TableName": self.table_name,
                    "Item": {
                        "pk": {"S": f"AUDIT#{entity}#{entity_id}"},
                        "sk": {"S": f"TS#{utc_now_iso()}"},
                        "entity": {"S": entity},
                        "entity_id": {"S": entity_id},
                        "action": {"S": action},
                        "actor_sub": {"S": actor_sub},
                        "changes": {"S": changes[:1000]},
                    },
                }
            }
        )

    def ensure_active_authorization(self, user_sub: str, token_authz_version: int, sensitive: bool) -> None:
        if not sensitive:
            return
        response = self.client.get_item(
            TableName=self.table_name,
            Key={"pk": {"S": f"USER#{user_sub}"}, "sk": {"S": "PROFILE"}},
            ConsistentRead=True,
        )
        item = response.get("Item")
        if not item:
            raise AuthorizationStateError("User profile missing")
        status_value = item.get("status", {}).get("S", "DISABLED")
        authz_version = int(item.get("authz_version", {}).get("N", "0"))
        if status_value != "ACTIVE" or authz_version != token_authz_version:
            raise AuthorizationStateError("Stale or revoked authorization")

    def get_manager_scopes(self, manager_sub: str) -> set[str]:
        result = self.client.query(
            TableName=self.table_name,
            KeyConditionExpression="pk = :pk AND begins_with(sk, :prefix)",
            ExpressionAttributeValues={
                ":pk": {"S": f"USER#{manager_sub}"},
                ":prefix": {"S": "SCOPE#"},
            },
        )
        return {item["scope"]["S"] for item in result.get("Items", [])}

    def get_user_profile(self, sub: str) -> dict[str, Any] | None:
        response = self.client.get_item(
            TableName=self.table_name,
            Key={"pk": {"S": f"USER#{sub}"}, "sk": {"S": "PROFILE"}},
            ConsistentRead=True,
        )
        item = response.get("Item")
        if not item:
            return None
        return {
            "sub": sub,
            "status": item.get("status", {}).get("S", "ACTIVE"),
            "authz_version": int(item.get("authz_version", {}).get("N", "0")),
        }

    def put_user_profile(self, sub: str, email: str, groups: list[str], status_value: str, authz_version: int) -> None:
        self.client.put_item(
            TableName=self.table_name,
            Item={
                "pk": {"S": f"USER#{sub}"},
                "sk": {"S": "PROFILE"},
                "entity_type": {"S": "user"},
                "sub": {"S": sub},
                "email": {"S": email},
                "groups": {"SS": groups or ["__none__"]},
                "status": {"S": status_value},
                "authz_version": {"N": str(authz_version)},
                "updated_at": {"S": utc_now_iso()},
            },
        )

    def set_user_status(self, sub: str, status_value: str) -> None:
        self.client.update_item(
            TableName=self.table_name,
            Key={"pk": {"S": f"USER#{sub}"}, "sk": {"S": "PROFILE"}},
            UpdateExpression="SET #status = :status",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": {"S": status_value}},
        )

    def bump_authz_version(self, sub: str) -> int:
        response = self.client.update_item(
            TableName=self.table_name,
            Key={"pk": {"S": f"USER#{sub}"}, "sk": {"S": "PROFILE"}},
            UpdateExpression="SET authz_version = if_not_exists(authz_version, :zero) + :one",
            ExpressionAttributeValues={":zero": {"N": "0"}, ":one": {"N": "1"}},
            ReturnValues="UPDATED_NEW",
        )
        return int(response["Attributes"]["authz_version"]["N"])

    def list_reporting_records(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        requisitions: list[dict[str, Any]] = []
        interviews: list[dict[str, Any]] = []
        exclusive_start_key: dict[str, Any] | None = None
        while True:
            request: dict[str, Any] = {
                "TableName": self.table_name,
                "FilterExpression": "#entity_type IN (:requisition, :interview)",
                "ExpressionAttributeValues": {
                    ":requisition": {"S": "requisition"},
                    ":interview": {"S": "interview"},
                },
                "ProjectionExpression": (
                    "pk, #entity_type, requisition_id, title, client_name, #status, "
                    "positions_total, positions_filled, positions_open, department, #project, "
                    "candidate_id, panel_subs, lead_panel_sub, round_name, interview_type, #mode, "
                    "meeting_url, venue, instructions, start_utc, end_utc, #timezone, #version, feedback_status"
                ),
                "ExpressionAttributeNames": {
                    "#entity_type": "entity_type",
                    "#status": "status",
                    "#project": "project",
                    "#timezone": "timezone",
                    "#mode": "mode",
                    "#version": "version",
                },
            }
            if exclusive_start_key:
                request["ExclusiveStartKey"] = exclusive_start_key
            response = self.client.scan(**request)
            for item in response.get("Items", []):
                entity_type = item["entity_type"]["S"]
                if entity_type == "requisition":
                    requisitions.append(
                        {
                            "requisition_id": item["requisition_id"]["S"],
                            "title": item.get("title", {}).get("S", ""),
                            "client_name": item.get("client_name", {}).get("S", ""),
                            "status": item.get("status", {}).get("S", ""),
                            "positions_total": int(item.get("positions_total", {}).get("N", "0")),
                            "positions_filled": int(item.get("positions_filled", {}).get("N", "0")),
                            "positions_open": int(item.get("positions_open", {}).get("N", "0")),
                            "department": item.get("department", {}).get("S", ""),
                            "project": item.get("project", {}).get("S", ""),
                        }
                    )
                else:
                    interviews.append(
                        {
                            "interview_id": item["pk"]["S"].removeprefix("INTERVIEW#"),
                            "requisition_id": item["requisition_id"]["S"],
                            "candidate_id": item.get("candidate_id", {}).get("S", ""),
                            "department": item.get("department", {}).get("S", ""),
                            "project": item.get("project", {}).get("S", ""),
                            "panel_subs": item.get("panel_subs", {}).get("SS", []),
                            "lead_panel_sub": item.get("lead_panel_sub", {}).get("S", ""),
                            "round_name": item.get("round_name", {}).get("S", ""),
                            "interview_type": item.get("interview_type", {}).get("S", ""),
                            "mode": item.get("mode", {}).get("S", ""),
                            "meeting_url": item.get("meeting_url", {}).get("S", ""),
                            "venue": item.get("venue", {}).get("S", ""),
                            "instructions": item.get("instructions", {}).get("S", ""),
                            "start_utc": item["start_utc"]["S"],
                            "end_utc": item["end_utc"]["S"],
                            "timezone": item.get("timezone", {}).get("S", ""),
                            "version": int(item.get("version", {}).get("N", "1")),
                            "status": item.get("status", {}).get("S", ""),
                            "feedback_status": item.get("feedback_status", {}).get("S", "Not Started"),
                        }
                    )
            exclusive_start_key = response.get("LastEvaluatedKey")
            if not exclusive_start_key:
                break
        return requisitions, interviews

    def put_candidate(self, candidate_id: str, payload: dict[str, Any], actor_sub: str) -> None:
        now = utc_now_iso()
        item = {
            "pk": {"S": f"CANDIDATE#{candidate_id}"},
            "sk": {"S": "PROFILE"},
            "entity_type": {"S": "candidate"},
            "candidate_id": {"S": candidate_id},
            "full_name": {"S": payload["full_name"]},
            "email": {"S": payload["email"]},
            "phone": {"S": payload["phone"]},
            "department": {"S": payload["department"]},
            "project": {"S": payload["project"]},
            "candidate_type": {"S": payload["candidate_type"]},
            "ta_owner_sub": {"S": payload["ta_owner_sub"]},
            "payload_json": {"S": str(payload)},
            "updated_at": {"S": now},
            "updated_by": {"S": actor_sub},
            "gsi1pk": {"S": f"CANDIDATE#{payload['department']}#{payload['project']}"},
            "gsi1sk": {"S": f"UPDATED#{now}#{candidate_id}"},
        }
        self.client.put_item(TableName=self.table_name, Item=item)

    def put_requisition(self, payload: dict[str, Any], actor_sub: str) -> None:
        now = utc_now_iso()
        req_id = payload["requisition_id"]
        intake_received_at_utc = payload["intake_received_at_utc"]
        status_value = payload["status"]
        positions_total = int(payload["positions_total"])
        positions_filled = int(payload["positions_filled"])
        positions_open = max(0, positions_total - positions_filled)
        self.client.put_item(
            TableName=self.table_name,
            Item={
                "pk": {"S": f"REQUISITION#{req_id}"},
                "sk": {"S": "PROFILE"},
                "entity_type": {"S": "requisition"},
                "requisition_id": {"S": req_id},
                "title": {"S": payload["title"]},
                "department": {"S": payload["department"]},
                "project": {"S": payload["project"]},
                "status": {"S": status_value},
                "intake_received_at_utc": {"S": intake_received_at_utc},
                "positions_total": {"N": str(positions_total)},
                "positions_filled": {"N": str(positions_filled)},
                "positions_open": {"N": str(positions_open)},
                "client_name": {"S": payload["client_name"]},
                "gsi1pk": {"S": f"REQUISITION#STATUS#{status_value}"},
                "gsi1sk": {"S": f"INTAKE#{intake_received_at_utc}#{req_id}"},
                "payload_json": {"S": str(payload)},
                "updated_at": {"S": now},
                "updated_by": {"S": actor_sub},
            },
        )

    def list_candidates(self) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        exclusive_start_key: dict[str, Any] | None = None
        while True:
            request: dict[str, Any] = {
                "TableName": self.table_name,
                "FilterExpression": "entity_type = :candidate",
                "ExpressionAttributeValues": {":candidate": {"S": "candidate"}},
                "ProjectionExpression": "candidate_id, full_name, email, phone, candidate_type, department, #project",
                "ExpressionAttributeNames": {"#project": "project"},
            }
            if exclusive_start_key:
                request["ExclusiveStartKey"] = exclusive_start_key
            response = self.client.scan(**request)
            for item in response.get("Items", []):
                candidates.append(
                    {
                        "candidate_id": item["candidate_id"]["S"],
                        "full_name": item.get("full_name", {}).get("S", ""),
                        "email": item.get("email", {}).get("S", ""),
                        "phone": item.get("phone", {}).get("S", ""),
                        "candidate_type": item.get("candidate_type", {}).get("S", ""),
                        "department": item.get("department", {}).get("S", ""),
                        "project": item.get("project", {}).get("S", ""),
                    }
                )
            exclusive_start_key = response.get("LastEvaluatedKey")
            if not exclusive_start_key:
                break
        return candidates

    def list_requisitions(self) -> list[dict[str, Any]]:
        requisitions, _ = self.list_reporting_records()
        return requisitions

    def get_requisition_scope(self, requisition_id: str) -> tuple[str, str]:
        result = self.client.get_item(
            TableName=self.table_name,
            Key={"pk": {"S": f"REQUISITION#{requisition_id}"}, "sk": {"S": "PROFILE"}},
            ConsistentRead=True,
        )
        item = result.get("Item")
        if not item:
            raise KeyError("Requisition not found")
        return item["department"]["S"], item["project"]["S"]

    def schedule_interview(self, payload: SchedulePayload) -> dict[str, Any]:
        start_utc = datetime.fromisoformat(payload.start_utc)
        end_utc = datetime.fromisoformat(payload.end_utc)
        if end_utc <= start_utc:
            raise ValueError("end time must be after start time")
        start_with_buffer = start_utc - timedelta(minutes=settings.reservation_buffer_minutes)
        end_with_buffer = end_utc + timedelta(minutes=settings.reservation_buffer_minutes)
        slots = slot_keys(start_with_buffer, end_with_buffer)
        tx_items: list[dict[str, Any]] = []
        tx_items.append(
            {
                "Put": {
                    "TableName": self.table_name,
                    "Item": {
                        "pk": {"S": f"IDEMP#{payload.idempotency_key}"},
                        "sk": {"S": "SCHEDULE"},
                        "interview_id": {"S": payload.interview_id},
                        "created_at": {"S": utc_now_iso()},
                    },
                    "ConditionExpression": "attribute_not_exists(pk)",
                }
            }
        )
        for panel_sub in payload.panel_subs + [f"CANDIDATE::{payload.candidate_id}"]:
            subject_key = panel_sub
            for slot in slots:
                tx_items.append(
                    {
                        "Put": {
                            "TableName": self.table_name,
                            "Item": {
                                "pk": {"S": f"RSV#{subject_key}#{slot}"},
                                "sk": {"S": f"INTERVIEW#{payload.interview_id}"},
                                "interview_id": {"S": payload.interview_id},
                            },
                            "ConditionExpression": "attribute_not_exists(pk)",
                        }
                    }
                )
        tx_items.append(
            {
                "Put": {
                    "TableName": self.table_name,
                    "Item": {
                        "pk": {"S": f"INTERVIEW#{payload.interview_id}"},
                        "sk": {"S": "PROFILE"},
                        "entity_type": {"S": "interview"},
                        "candidate_id": {"S": payload.candidate_id},
                        "requisition_id": {"S": payload.requisition_id},
                        "department": {"S": payload.department},
                        "project": {"S": payload.project},
                        "panel_subs": {"SS": payload.panel_subs},
                        "lead_panel_sub": {"S": payload.lead_panel_sub},
                        "start_utc": {"S": payload.start_utc},
                        "end_utc": {"S": payload.end_utc},
                        "timezone": {"S": payload.timezone},
                        "round_name": {"S": payload.round_name},
                        "interview_type": {"S": payload.interview_type},
                        "mode": {"S": payload.mode},
                        "meeting_url": {"S": payload.meeting_url or ""},
                        "venue": {"S": payload.venue or ""},
                        "instructions": {"S": payload.instructions or ""},
                        "required_skills": {"SS": payload.required_skills or ["general"]},
                        "status": {"S": InterviewStatus.SCHEDULED.value},
                        "version": {"N": "1"},
                        "feedback_status": {"S": "Not Started"},
                        "gsi1pk": {"S": f"PANEL#{payload.lead_panel_sub}"},
                        "gsi1sk": {"S": f"START#{payload.start_utc}#{payload.interview_id}"},
                        "gsi2pk": {"S": f"SCOPE#{payload.department}#{payload.project}"},
                        "gsi2sk": {"S": f"START#{payload.start_utc}#{payload.interview_id}"},
                        "gsi3pk": {"S": "INTERVIEW#ALL"},
                        "gsi3sk": {"S": f"START#{payload.start_utc}#{payload.interview_id}"},
                    },
                }
            }
        )
        self._put_audit(
            tx_items,
            entity="interview",
            entity_id=payload.interview_id,
            action="scheduled",
            actor_sub=payload.actor_sub,
            changes=f"start={payload.start_utc},end={payload.end_utc},panel={payload.panel_subs}",
        )
        try:
            self.client.transact_write_items(TransactItems=tx_items)
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "TransactionCanceledException":
                raise ConflictError("Slot already reserved or idempotency key conflict") from exc
            raise
        return {
            "interview_id": payload.interview_id,
            "status": InterviewStatus.SCHEDULED.value,
            "version": 1,
        }

    def _reservation_subjects(self, panel_subs: list[str], candidate_id: str) -> list[str]:
        return panel_subs + [f"CANDIDATE::{candidate_id}"]

    def reschedule_interview(
        self,
        interview_id: str,
        start_utc: str,
        end_utc: str,
        timezone_name: str,
        reason: str,
        actor_sub: str,
        expected_version: int,
        idempotency_key: str,
    ) -> dict[str, Any]:
        existing = self.get_interview(interview_id)
        if not existing:
            raise KeyError("Interview not found")
        old_start = datetime.fromisoformat(existing["start_utc"])
        old_end = datetime.fromisoformat(existing["end_utc"])
        new_start = datetime.fromisoformat(start_utc)
        new_end = datetime.fromisoformat(end_utc)
        if new_end <= new_start:
            raise ValueError("end time must be after start time")
        old_slots = slot_keys(
            old_start - timedelta(minutes=settings.reservation_buffer_minutes),
            old_end + timedelta(minutes=settings.reservation_buffer_minutes),
        )
        new_slots = slot_keys(
            new_start - timedelta(minutes=settings.reservation_buffer_minutes),
            new_end + timedelta(minutes=settings.reservation_buffer_minutes),
        )
        subjects = self._reservation_subjects(existing["panel_subs"], existing["candidate_id"])
        tx_items: list[dict[str, Any]] = [
            {
                "Put": {
                    "TableName": self.table_name,
                    "Item": {
                        "pk": {"S": f"IDEMP#{idempotency_key}"},
                        "sk": {"S": "RESCHEDULE"},
                        "interview_id": {"S": interview_id},
                        "created_at": {"S": utc_now_iso()},
                    },
                    "ConditionExpression": "attribute_not_exists(pk)",
                }
            }
        ]
        for subject in subjects:
            for slot in old_slots:
                tx_items.append(
                    {
                        "Delete": {
                            "TableName": self.table_name,
                            "Key": {"pk": {"S": f"RSV#{subject}#{slot}"}, "sk": {"S": f"INTERVIEW#{interview_id}"}},
                        }
                    }
                )
            for slot in new_slots:
                tx_items.append(
                    {
                        "Put": {
                            "TableName": self.table_name,
                            "Item": {
                                "pk": {"S": f"RSV#{subject}#{slot}"},
                                "sk": {"S": f"INTERVIEW#{interview_id}"},
                                "interview_id": {"S": interview_id},
                            },
                            "ConditionExpression": "attribute_not_exists(pk)",
                        }
                    }
                )
        tx_items.append(
            {
                "Update": {
                    "TableName": self.table_name,
                    "Key": {"pk": {"S": f"INTERVIEW#{interview_id}"}, "sk": {"S": "PROFILE"}},
                    "UpdateExpression": "SET start_utc = :start_utc, end_utc = :end_utc, timezone = :tz, #v = #v + :one",
                    "ConditionExpression": "#v = :expected_version",
                    "ExpressionAttributeNames": {"#v": "version"},
                    "ExpressionAttributeValues": {
                        ":start_utc": {"S": start_utc},
                        ":end_utc": {"S": end_utc},
                        ":tz": {"S": timezone_name},
                        ":one": {"N": "1"},
                        ":expected_version": {"N": str(expected_version)},
                    },
                }
            }
        )
        self._put_audit(tx_items, "interview", interview_id, "rescheduled", actor_sub, reason)
        try:
            self.client.transact_write_items(TransactItems=tx_items)
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "TransactionCanceledException":
                raise ConflictError("Reschedule conflict or stale version") from exc
            raise
        current = self.get_interview(interview_id)
        if not current:
            raise KeyError("Interview missing after reschedule")
        return current

    def cancel_interview(self, interview_id: str, reason: str, actor_sub: str, expected_version: int, idempotency_key: str) -> dict[str, Any]:
        existing = self.get_interview(interview_id)
        if not existing:
            raise KeyError("Interview not found")
        old_start = datetime.fromisoformat(existing["start_utc"])
        old_end = datetime.fromisoformat(existing["end_utc"])
        old_slots = slot_keys(
            old_start - timedelta(minutes=settings.reservation_buffer_minutes),
            old_end + timedelta(minutes=settings.reservation_buffer_minutes),
        )
        subjects = self._reservation_subjects(existing["panel_subs"], existing["candidate_id"])
        tx_items: list[dict[str, Any]] = [
            {
                "Put": {
                    "TableName": self.table_name,
                    "Item": {
                        "pk": {"S": f"IDEMP#{idempotency_key}"},
                        "sk": {"S": "CANCEL"},
                        "interview_id": {"S": interview_id},
                        "created_at": {"S": utc_now_iso()},
                    },
                    "ConditionExpression": "attribute_not_exists(pk)",
                }
            }
        ]
        for subject in subjects:
            for slot in old_slots:
                tx_items.append(
                    {
                        "Delete": {
                            "TableName": self.table_name,
                            "Key": {"pk": {"S": f"RSV#{subject}#{slot}"}, "sk": {"S": f"INTERVIEW#{interview_id}"}},
                        }
                    }
                )
        tx_items.append(
            {
                "Update": {
                    "TableName": self.table_name,
                    "Key": {"pk": {"S": f"INTERVIEW#{interview_id}"}, "sk": {"S": "PROFILE"}},
                    "UpdateExpression": "SET #status = :cancelled, #v = #v + :one",
                    "ConditionExpression": "#v = :expected_version",
                    "ExpressionAttributeNames": {"#v": "version", "#status": "status"},
                    "ExpressionAttributeValues": {
                        ":cancelled": {"S": InterviewStatus.CANCELLED.value},
                        ":one": {"N": "1"},
                        ":expected_version": {"N": str(expected_version)},
                    },
                }
            }
        )
        self._put_audit(tx_items, "interview", interview_id, "cancelled", actor_sub, reason)
        try:
            self.client.transact_write_items(TransactItems=tx_items)
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "TransactionCanceledException":
                raise ConflictError("Cancel conflict or stale version") from exc
            raise
        current = self.get_interview(interview_id)
        if not current:
            raise KeyError("Interview missing after cancel")
        return current

    def get_interview(self, interview_id: str) -> dict[str, Any] | None:
        result = self.client.get_item(
            TableName=self.table_name,
            Key={"pk": {"S": f"INTERVIEW#{interview_id}"}, "sk": {"S": "PROFILE"}},
            ConsistentRead=True,
        )
        item = result.get("Item")
        if not item:
            return None
        return {
            "interview_id": interview_id,
            "candidate_id": item["candidate_id"]["S"],
            "requisition_id": item["requisition_id"]["S"],
            "department": item["department"]["S"],
            "project": item["project"]["S"],
            "panel_subs": item.get("panel_subs", {}).get("SS", []),
            "lead_panel_sub": item["lead_panel_sub"]["S"],
            "start_utc": item["start_utc"]["S"],
            "end_utc": item["end_utc"]["S"],
            "timezone": item["timezone"]["S"],
            "status": item["status"]["S"],
            "version": int(item["version"]["N"]),
        }
