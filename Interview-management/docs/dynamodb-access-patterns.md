# DynamoDB Access Patterns

Single-table design (`pk`, `sk`) with GSIs.

## Primary entities

- User profile: `pk=USER#{sub}`, `sk=PROFILE`
- Manager scope: `pk=USER#{sub}`, `sk=SCOPE#{department}#{project}`
- Candidate: `pk=CANDIDATE#{id}`, `sk=PROFILE`
- Requisition: `pk=REQUISITION#{id}`, `sk=PROFILE`
- Interview: `pk=INTERVIEW#{id}`, `sk=PROFILE`
- Feedback: `pk=FEEDBACK#{interviewId}`, `sk=PANEL#{sub}`
- Audit: `pk=AUDIT#{entity}#{entityId}`, `sk=TS#{isoUtc}`
- Reservation: `pk=RSV#{subject}#{slot}`, `sk=INTERVIEW#{id}`
- Idempotency: `pk=IDEMP#{key}`, `sk={operation}`

## GSIs

- `gsi1`: panel timeline (`gsi1pk=PANEL#{sub}`, `gsi1sk=START#{utc}#{id}`)
- `gsi2`: scope timeline (`gsi2pk=SCOPE#{department}#{project}`, `gsi2sk=START#{utc}#{id}`)
- `gsi3`: all interviews (`gsi3pk=INTERVIEW#ALL`, `gsi3sk=START#{utc}#{id}`)

## Routine queries

- Panel interviews by date: query `gsi1` with bounded `gsi1sk`.
- Department/project interviews: query `gsi2` with bounded `gsi2sk`.
- All scheduled interviews: query `gsi3` with bounded `gsi3sk`.
- Candidate interview history: maintain candidate reference records (same `pk` or GSI fan-out).
- Pending feedback by panel: `pk=FEEDBACK#{interviewId}` + status filter by panel assignment list.
- Audit by entity: query `pk=AUDIT#{entity}#{id}` sorted by `sk`.

## Concurrency strategy for scheduling

- Convert meeting window into buffered discrete slots.
- Reserve all required slots (panel + candidate) in one transaction with `attribute_not_exists(pk)`.
- Insert idempotency key in same transaction.
- Reschedule does atomic release old slots + reserve new slots + interview version increment (`ConditionExpression`).
- Return `409` on slot/version conflicts.

## Search limitations

- Supports indexed filters (department/project/date/panel/status).
- Does not provide arbitrary full-text search.

