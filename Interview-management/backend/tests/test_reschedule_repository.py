import pytest
from botocore.exceptions import ClientError

from app.repository import DynamoRepository

RESERVED_WORDS = {"TIMEZONE", "START", "END", "STATUS", "VERSION"}


class FakeDynamoClient:
    """Mimics DynamoDB's rejection of unescaped reserved words in expressions.

    Real DynamoDB raises a ValidationException (not a TransactionCanceledException)
    when an UpdateExpression/ConditionExpression references a reserved word without
    an ExpressionAttributeNames placeholder. The production code previously caught
    only TransactionCanceledException and re-raised everything else, so this bug
    surfaced to users as an unhandled 500 on every reschedule.
    """

    def __init__(self, interview_item: dict):
        self.interview_item = interview_item

    def get_item(self, **_kwargs):
        return {"Item": self.interview_item}

    def transact_write_items(self, TransactItems):  # noqa: N803 (matches boto3 kwarg name)
        for item in TransactItems:
            update = item.get("Update")
            if not update:
                continue
            expression = update["UpdateExpression"]
            names = update.get("ExpressionAttributeNames", {})
            aliased_tokens = set(names.values())
            for word in RESERVED_WORDS:
                # A bare reserved word (not preceded by '#') used directly as an
                # attribute name in the expression is what DynamoDB rejects.
                if word.lower() in expression.lower() and word not in aliased_tokens:
                    bare_present = f" {word.lower()} " in f" {expression.lower()} "
                    if bare_present:
                        raise ClientError(
                            {"Error": {"Code": "ValidationException", "Message": f"Attribute name is a reserved keyword: {word}"}},
                            "TransactWriteItems",
                        )
        return {}


def _repository_with_interview() -> DynamoRepository:
    repo = DynamoRepository.__new__(DynamoRepository)
    repo.client = FakeDynamoClient(
        {
            "candidate_id": {"S": "cand-1"},
            "requisition_id": {"S": "REQ-1"},
            "department": {"S": "Engineering"},
            "project": {"S": "Core"},
            "panel_subs": {"SS": ["panel-1"]},
            "lead_panel_sub": {"S": "panel-1"},
            "start_utc": {"S": "2026-09-16T04:30:00+00:00"},
            "end_utc": {"S": "2026-09-16T05:30:00+00:00"},
            "timezone": {"S": "Asia/Kolkata"},
            "status": {"S": "Scheduled"},
            "version": {"N": "1"},
        }
    )
    repo.table_name = "test-table"
    return repo


def test_reschedule_interview_does_not_use_bare_reserved_word() -> None:
    repo = _repository_with_interview()
    # Should not raise: the UpdateExpression must alias "timezone" via ExpressionAttributeNames.
    result = repo.reschedule_interview(
        interview_id="int-1",
        start_utc="2026-09-23T05:00:00+00:00",
        end_utc="2026-09-23T06:00:00+00:00",
        timezone_name="Asia/Kolkata",
        reason="panel availability",
        actor_sub="admin-1",
        expected_version=1,
        idempotency_key="resched-1",
    )
    assert result["timezone"] == "Asia/Kolkata"
