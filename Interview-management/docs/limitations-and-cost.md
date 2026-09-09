# Known Limitations and Cost Notes

## Current limitations

- Production read/list endpoints for all entities are scaffolded; primary scheduling path is fully implemented first.
- Calendar invites are currently downloadable ICS and in-app only; SES/EventBridge reminder pipeline is documented for optional enablement.
- DynamoDB duplicate detection is best-effort (email/phone exact match) and should be augmented if fuzzy matching is needed.
- Search is index-based, not full-text.

## AWS cost considerations

- Major cost drivers: CloudFront egress, Lambda invocations, DynamoDB throughput/storage, Cognito MAUs, CloudWatch logs.
- Keep CloudFront cache hit ratio high with immutable hashed assets.
- Use bounded date queries to reduce DynamoDB read costs.
- Tune log retention per environment (shorter for dev/staging).
- Enable budgets and alarms for monthly spend.

