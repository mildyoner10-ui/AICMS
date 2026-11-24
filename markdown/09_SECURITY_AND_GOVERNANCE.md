# Security, Privacy & Governance

## 1. Security Objectives

Protect infrastructure configuration, credentials, change records, approval decisions, and audit evidence against unauthorized access, disclosure, modification, and loss.

## 2. Identity and Access

- SSO/OIDC and MFA where supported.
- RBAC plus object/scope authorization.
- Least privilege.
- Separation of duties.
- Admin actions separately audited.
- Service accounts per integration.
- Periodic access review and immediate revocation on offboarding.

## 3. File Security

- Allowlist extensions and MIME types.
- Verify file magic bytes.
- Configurable maximum size.
- Malware scan before parsing/preview.
- Store outside web root in private object storage.
- Signed short-lived download URLs or backend authorization proxy.
- Checksum and immutable versioning.
- Sandboxed parsing with CPU/memory/time limits.
- Do not execute uploaded files.
- Reject or safely sandbox archive files.

## 4. Secret Handling

Configuration may contain passwords, tokens, SNMP communities, private keys, certificates, and API credentials.

- Detect and redact secrets before LLM calls.
- Never put secrets in logs, prompts, analytics, or browser telemetry.
- Use a secret manager for application/integration credentials.
- Restrict raw config access.
- Define retention and deletion policy with security owner.
- Consider storing redacted derivative separately from original.

## 5. AI Governance

- Human approval remains mandatory.
- AI outputs are advisory.
- Store model/provider/prompt/ruleset version and input hashes.
- Use approved private deployment/provider and contractual data controls.
- Do not train external models on uploaded data without explicit authorization.
- Treat all documents as untrusted prompt-injection content.
- No tools for AI to execute device commands or alter approval state.
- Show limitations and confidence carefully.
- Monitor false negatives, false positives, and human overrides.
- Require validation set and sign-off before production.

## 6. Audit

Record:
- RFC creation and revision.
- Document upload/download/version.
- AI review start/completion/failure.
- Risk calculation.
- Workflow routing.
- Approval decision and comment.
- Schedule changes.
- Implementation/PIR.
- Role and policy changes.
- Integration data access.

Use append-only design and restricted database permissions. Export/forward logs to centralized logging or SIEM where required.

## 7. Network and Deployment Segmentation

Suggested zones:
- User access / reverse proxy.
- Application API.
- Worker/AI processing.
- Database and object storage.
- Integration connector zone.

Only required ports should be opened. Workers should not have direct device-management access in MVP.

## 8. Backup & Recovery

- Database backup with tested restore.
- Object storage versioning/backup.
- Encryption key backup under controlled access.
- Documented RPO/RTO.
- Periodic recovery exercise.

## 9. Governance Decisions Required Before Production

- Approved change policy and categories.
- Approval matrix and delegation rules.
- Emergency change policy.
- Mandatory document checklist by category.
- Risk formula and thresholds.
- Security baseline and exceptions.
- AI model/provider approval.
- Data classification and retention.
- Audit retention.
- Integration service-account scopes.
- RPO/RTO and operational ownership.
