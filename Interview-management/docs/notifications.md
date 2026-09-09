# Notifications Design

## In-app

- Store notification records in DynamoDB by user and timestamp.
- Display unread count in SPA header.
- Trigger on schedule/reschedule/cancel/feedback submit/reopen/decision.

## Calendar invites

- Generate downloadable `.ics` from backend endpoint per interview version.
- Include UID containing interview ID + version.
- On reschedule/cancel, issue updated ICS with incremented sequence and status.

## Optional email/reminders

- Use SES for outbound emails (domain verification + production access required).
- Use EventBridge Scheduler + SQS + Lambda worker for reminders.
- Reminder worker checks current interview version and status before sending.
- Reschedule/cancel invalidates previous reminder jobs and enqueues fresh ones.
- Use idempotency key per reminder action to suppress duplicate notifications.

