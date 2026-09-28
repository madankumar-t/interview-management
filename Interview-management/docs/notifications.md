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

- EventBridge runs the feedback reminder worker hourly. At least 24 hours after an interview ends, it checks feedback submitted by each assigned panel member. Missing members and the candidate's TA owner receive private in-app reminders at `/reminders`.
- A conditional DynamoDB item keyed by recipient, interview and interview version prevents repeated reminders; dismissal hides the item without deleting its idempotency key. Cancelled interviews and fully submitted feedback are skipped. A rescheduled interview is evaluated against its current end time and version.
- Email delivery is not enabled in dev: SES in us-east-2 has no verified sending identity and production sending access is disabled. Verify a sender and obtain sending access before adding SES email delivery; in-app reminders remain available without SES.

