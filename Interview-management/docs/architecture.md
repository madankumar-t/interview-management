# Architecture

```mermaid
flowchart LR
  U[User Browser] --> CF[CloudFront + OAC]
  CF --> S3[Private S3 Frontend]
  U --> COG[Cognito Hosted UI]
  U --> API[API Gateway HTTP API]
  API --> L[Lambda FastAPI + Mangum]
  L --> DDB[DynamoDB Single Table]
  L --> S3D[Private S3 Documents]
  L --> CW[CloudWatch Logs/Metrics]
  EB[EventBridge Scheduler] --> Q[SQS Reminder Queue]
  Q --> L
```

- API Gateway validates JWT against Cognito and required API scopes.
- Backend enforces capability + record-level authorization using Cognito groups + DynamoDB scopes.
- Sensitive requests use bounded authorization revocation via user status/authz version check.

