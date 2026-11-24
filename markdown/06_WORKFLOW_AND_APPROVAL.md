# Workflow & Approval Rules

## 1. Change Lifecycle States

Draft → Submitted → Document Validation → AI Review → Pending Approval → Approved → Scheduled → In Progress → Validation → Completed → Closed.

Exception states:
- Revision Required
- Rejected
- Cancelled
- Failed
- Rolled Back
- Review Failed
- Stale

## 2. Transition Rules

| From | To | Guard |
|---|---|---|
| Draft | Submitted | Required RFC fields complete |
| Submitted | Document Validation | Submission snapshot created |
| Document Validation | AI Review | Required files scanned and extractable, or exceptions recorded |
| AI Review | Pending Approval | Review completed; no unresolved mandatory blocker |
| AI Review | Revision Required | Findings require requester action |
| Pending Approval | Approved | All required approval tasks approved |
| Pending Approval | Rejected | Authorized approver rejects |
| Approved | Scheduled | Approved window assigned |
| Scheduled | In Progress | Authorized implementation start |
| In Progress | Validation | Execution recorded |
| Validation | Completed | Post-check passes and outcome accepted |
| Completed | Closed | PIR/closure conditions met |

## 3. Default Approval Matrix (Configurable)

| Risk / Type | Suggested Route |
|---|---|
| Low normal | Technical Reviewer → Manager |
| Medium normal | Technical Reviewer → Manager → Change Manager |
| High normal | Technical Reviewer → Manager → Change Manager → CAB → Final Approver |
| Emergency | Emergency Approver(s) → Change Manager → retrospective CAB/PIR |

This is a template only. Final matrix must be approved by process owner.

## 4. Approval Rules

- Approval task assigned to role or named user.
- Approver must be active and authorized for the change scope.
- Requester cannot approve own change when SoD applies.
- Approver must provide comment for reject/request revision.
- Approval decision is immutable; correction requires a new event/administrative correction record.
- Parallel approvals complete only when all mandatory parallel tasks are approved.
- Delegation must be policy-controlled and audited.
- Timeout triggers reminder/escalation, not automatic approval.
- No response is never interpreted as approval.

## 5. Stale Approval

Any material change to:
- proposed config,
- implementation plan,
- rollback plan,
- affected service/device,
- change window,
- risk-relevant document,

must create a new revision, mark prior AI review stale, and invalidate approval steps according to policy.

## 6. Change Calendar

Detect overlap based on:
- same affected device,
- same affected service,
- same maintenance window,
- declared dependency.

Overlap is a warning for human review, not automatically a conflict unless policy says so.

## 7. Emergency Change

- Capture emergency justification and incident/reference ID.
- Require designated emergency approver(s).
- Record who authorized and when.
- Run expedited technical review when feasible.
- Schedule retrospective review/PIR within policy-defined period.
- Emergency path must not bypass audit logging.

## 8. Execution Gate

Change is execution-ready only when:
- final approval is complete,
- approved revision is current,
- schedule is valid,
- implementation owner is assigned,
- mandatory pre-check and rollback conditions are satisfied.

MVP does not execute device configuration. It records human-led execution and evidence.
