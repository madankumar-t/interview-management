# Interview Management Application

Full-stack interview management system for internal employees and external candidates.

## Stack

- Frontend: React + TypeScript + Vite + Tailwind
- Backend: FastAPI + Mangum on AWS Lambda
- API: API Gateway HTTP API + Cognito JWT authorizer
- Data: DynamoDB
- Hosting: S3 private bucket + CloudFront OAC
- Infra: Terraform
- CI/CD: GitHub Actions + AWS OIDC

## Quick start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

### Package Lambda artifact

```powershell
cd backend
.\package_lambda.ps1
```

This produces [artifacts/backend.zip](/D:/Users/kumar.madan/code/Sazemaker/interview%20Management/artifacts/backend.zip), required by Terraform.

### Demo mode (local only)

The SPA supports a **strictly local** synthetic demo mode:

- `VITE_DEMO_MODE=true`
- `VITE_API_BASE_URL=http://localhost:8000`

Production environments must keep `VITE_DEMO_MODE=false` and use Cognito sign-in.

## Authentication and first admin bootstrap

1. Deploy Terraform for target environment.
2. Create first Cognito user with temporary password (CLI or console).
3. Add the user to `Administrator` group.
4. Set the user profile in DynamoDB with `authz_version=1`, `status=ACTIVE`.
5. User signs in via Cognito hosted UI and changes password.

`/admin/users/{id}/disable` and group updates are protected from removing/disabling the last active administrator.

## Core scheduling safety model

- UTC storage + IANA timezone preserved.
- Idempotency key required for scheduling mutations.
- Transactional slot reservations in DynamoDB prevent double-booking.
- Reschedule is atomic release+acquire with version check.
- Interview history is append-only.

## Requirement reporting

- Daily scheduled interview report endpoint: `GET /reports/daily-interviews?date=YYYY-MM-DD&timezone=Asia/Kolkata`
- Weekly requirement report endpoint: `GET /reports/weekly-requirement?week_start=YYYY-MM-DD&timezone=Asia/Kolkata`
- Reports page in SPA displays both reports with requisition/client and position progress.

## Deliverables map

- API code: [backend/app/](/D:/Users/kumar.madan/code/Sazemaker/interview%20Management/backend/app)
- Frontend code: [frontend/src/](/D:/Users/kumar.madan/code/Sazemaker/interview%20Management/frontend/src)
- Infra code: [infra/](/D:/Users/kumar.madan/code/Sazemaker/interview%20Management/infra)
- OpenAPI: [docs/openapi.yaml](/D:/Users/kumar.madan/code/Sazemaker/interview%20Management/docs/openapi.yaml)
- RBAC matrix: [docs/rbac-matrix.md](/D:/Users/kumar.madan/code/Sazemaker/interview%20Management/docs/rbac-matrix.md)
- DynamoDB patterns: [docs/dynamodb-access-patterns.md](/D:/Users/kumar.madan/code/Sazemaker/interview%20Management/docs/dynamodb-access-patterns.md)
- Runbook: [docs/runbook.md](/D:/Users/kumar.madan/code/Sazemaker/interview%20Management/docs/runbook.md)
- Architecture: [docs/architecture.md](/D:/Users/kumar.madan/code/Sazemaker/interview%20Management/docs/architecture.md)
- Known limitations/cost: [docs/limitations-and-cost.md](/D:/Users/kumar.madan/code/Sazemaker/interview%20Management/docs/limitations-and-cost.md)
