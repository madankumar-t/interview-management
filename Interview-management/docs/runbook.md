# Operational Runbook

## Deployment

1. Build backend artifact to `artifacts/backend.zip`.
2. Run Terraform plan/apply per environment:
   - `terraform -chdir=infra plan -var-file=environments/dev.tfvars`
   - `terraform -chdir=infra apply -var-file=environments/dev.tfvars`
3. Build frontend and upload to private S3 bucket.
4. Invalidate CloudFront (`/index.html`, `/assets/*`).
5. Run smoke test: `GET /health`.

## First administrator bootstrap

1. Create Cognito user via admin invite.
2. Add user to `Administrator` group.
3. Insert `USER#{sub}` profile into DynamoDB:
   - `status=ACTIVE`
   - `authz_version=1`
4. User signs in and completes password reset.

## Revocation policy

- Cognito group updates are not immediate for issued tokens.
- For sensitive endpoints, backend checks:
  - user status is ACTIVE
  - token `custom:authz_version` equals current DB value
- Admin disable/role-change increments `authz_version`.
- Existing token loses sensitive access until refresh/new login.

## Logging and retention

- Do not log tokens, full feedback payloads, or document contents.
- CloudWatch retention configurable (default 30 days in Terraform).
- Candidate retention policy should be implemented via scheduled archival/deletion jobs.

