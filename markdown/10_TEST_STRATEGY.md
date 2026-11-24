# Test Strategy

## 1. Test Layers

- Unit tests: domain rules, scoring, validation, state transitions.
- Integration tests: database, object storage, queue, AI adapter, notifications.
- API tests: schema, authorization, idempotency, error behavior.
- Frontend tests: forms, state, approval actions, accessibility.
- E2E tests: complete RFC lifecycle.
- Security tests: access control, upload validation, prompt injection, secret leakage.
- UAT: process owners, engineers, approvers, auditors.

## 2. Critical Test Scenarios

### RFC
- Required fields missing.
- Duplicate submission.
- Concurrent edits.
- Requester cannot edit submitted revision without creating a new revision.

### Documents
- Allowed and disallowed file.
- MIME spoofing.
- Oversized file.
- Malware scan failure.
- Duplicate content checksum.
- New version makes review stale.
- Unauthorized download blocked.

### AI
- Supported config parsed.
- Unsupported vendor syntax marked NOT_ASSESSED.
- Empty/corrupt document.
- Prompt injection inside document ignored.
- Secret values redacted.
- Invalid LLM JSON rejected.
- Provider timeout handled.
- Finding evidence points to real source location.
- AI cannot approve or invoke external command.

### Risk
- Boundary values 29/30, 49/50, 69/70.
- Hard blocker overrides low weighted score.
- Formula version persisted.
- Missing factor yields insufficient evidence or policy-defined handling.

### Approval
- Correct sequential route.
- Parallel route requires all mandatory approvals.
- Unauthorized role blocked.
- Self-approval blocked.
- Reject requires comment.
- Revision request returns to requester.
- Timeout does not auto-approve.
- Stale revision invalidates approval as configured.
- Delegation respects policy.

### Implementation
- Cannot start before approval.
- Actual outcome captured.
- Failed change can record rollback.
- Closure requires mandatory PIR.

## 3. E2E Golden Path

1. Requester logs in.
2. Creates Normal Network Change.
3. Uploads MOP, before config, after config, rollback, and test plan.
4. Submits RFC.
5. Worker processes documents.
6. AI review creates findings and risk score.
7. Requester fixes a finding and uploads new revision.
8. Review reruns and is completed.
9. Technical reviewer approves.
10. Manager approves.
11. Change manager schedules.
12. Engineer records implementation and post-check.
13. PIR completed.
14. Change closed.
15. Auditor views full history.

## 4. Quality Gates

- No critical authorization test failures.
- No unresolved critical security findings.
- All workflow transition tests pass.
- AI output schema validation passes.
- Backup/restore test completed.
- UAT sign-off obtained.
