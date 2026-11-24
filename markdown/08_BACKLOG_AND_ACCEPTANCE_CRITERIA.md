# Development Backlog & Acceptance Criteria

## Epic 1 – Foundation
- Set up monorepo or clearly separated frontend/backend.
- Docker Compose for web, API, worker, PostgreSQL, Redis, object storage.
- Environment config and `.env.example`.
- Structured logging and health endpoints.
- CI checks: lint, type check, unit tests.

**Acceptance:** fresh developer can start the stack using documented commands; health checks pass.

## Epic 2 – Authentication & RBAC
- User model and role model.
- Development authentication.
- OIDC integration interface.
- Protected frontend routes and API dependencies.
- Object-level access checks.

**Acceptance:** user without role cannot access protected action; auditor is read-only; admin-only routes are protected.

## Epic 3 – RFC
- Create/edit draft.
- RFC validation.
- Change number generator.
- Submit snapshot/revision.
- Search/filter/list/detail.

**Acceptance:** submitted RFC has immutable revision and status history.

## Epic 4 – Document Management
- Upload and metadata.
- File validation and size limits.
- SHA-256 checksum.
- Object storage.
- Version history.
- Malware scanning interface.
- Extraction status.

**Acceptance:** invalid file is rejected; same filename upload creates a new version; original bytes remain unchanged.

## Epic 5 – AI Review MVP
- Async review job.
- Text extraction.
- Completeness checklist.
- Rule engine.
- LLM adapter.
- Strict structured output validation.
- Findings/evidence UI.
- Review history and stale detection.

**Acceptance:** sample RFC produces structured findings; unsupported content is NOT_ASSESSED; malformed model output cannot become PASS.

## Epic 6 – Risk Engine
- Configurable factor weights.
- Score calculation.
- Hard blockers.
- Recommendation mapping.
- Versioned risk formula.

**Acceptance:** deterministic unit tests cover score boundaries and blocker override.

## Epic 7 – Approval Workflow
- Workflow definition and instance.
- Approval task inbox.
- Sequential/parallel routes.
- Approve/reject/revision.
- SoD.
- SLA reminder/escalation.
- Audit event.

**Acceptance:** unauthorized user cannot decide task; requester self-approval blocked when policy applies; no auto-approval on timeout.

## Epic 8 – Dashboard & Calendar
- KPI endpoints.
- Charts/tables.
- Filters.
- Calendar and overlap warning.

**Acceptance:** dashboard values reconcile with underlying records and respect access scope.

## Epic 9 – Implementation & PIR
- Implementation record.
- Evidence.
- Outcome.
- PIR and closure gate.

**Acceptance:** change cannot close while mandatory PIR fields are missing.

## Epic 10 – Security & Release
- Threat model.
- Secret redaction.
- File scanning.
- Backup/restore.
- Rate limits.
- Security tests.
- Deployment runbook.

**Acceptance:** security checklist signed off before production use.

## Suggested Sprint Sequence

| Sprint | Focus | Output |
|---|---|---|
| 0 | Repo, architecture, CI, local stack | Running skeleton |
| 1 | Auth, RBAC, RFC CRUD | Create and submit RFC |
| 2 | Document upload/versioning | Secure document repository |
| 3 | AI review pipeline | Findings and evidence |
| 4 | Risk and approval workflow | End-to-end approval |
| 5 | Dashboard, calendar, PIR | Operational MVP |
| 6 | Security hardening and UAT | Release candidate |

## Definition of Done

- Code formatted and linted.
- Type checking passes.
- Unit/integration tests pass.
- API contract updated.
- Migration included.
- Authorization tested.
- Audit event added for sensitive mutation.
- Error/loading/empty states implemented.
- Documentation updated.
- No secrets committed.
