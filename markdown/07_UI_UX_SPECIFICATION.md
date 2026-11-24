# UI/UX Specification

## 1. Design Direction

Enterprise IT operations portal. Desktop-first, responsive, clear information hierarchy, neutral background, restrained status colors. Avoid excessive gradients and decorative visuals. Use accessible contrast and consistent status badges.

## 2. Main Navigation

- Overview
- My Change Requests
- Approval Inbox
- AI Review Center
- Change Calendar
- Reports & Audit
- Administration (role-gated)

## 3. Pages

### A. Login
- SSO login.
- Development-only local login clearly marked.
- No public self-registration unless enabled by admin.

### B. Dashboard
KPI cards:
- Total changes
- Draft/submitted
- Pending approvals
- AI review pending/flagged
- Upcoming changes
- Completed/failed/rolled back

Charts:
- Change by status
- Risk distribution
- Change by category
- Approval aging
- Success/failure trend

Tables:
- My pending tasks
- Recent changes
- Upcoming maintenance windows
- High severity AI findings

### C. Change List
- Search by Change ID/title/device/service.
- Filters: status, category, type, risk, requester, date, environment.
- Sort and pagination.
- Export only for authorized roles.

### D. Create/Edit RFC Wizard
Step 1: General information  
Step 2: Scope and affected services/devices  
Step 3: Implementation/test/rollback plans  
Step 4: Schedule and risk/impact  
Step 5: Documents  
Step 6: Review and submit

Show required-field validation and save draft.

### E. Change Detail
Tabs:
- Overview
- Documents
- AI Review
- Risk
- Approval Workflow
- Schedule
- Implementation & PIR
- Audit History

Header displays Change ID, title, status, risk, owner, and actions allowed for current user.

### F. Document Center
- Drag/drop upload.
- Document type selection.
- Version list, uploader, time, hash, scan/extraction state.
- Preview for supported safe formats.
- Download access-controlled.
- Clearly show processing errors.

### G. AI Review Result
Display:
- Review status and source revision.
- Recommendation (advisory).
- Risk score and factor breakdown.
- Hard blockers.
- Findings grouped by severity/category.
- Evidence links to document/page/line.
- Remediation suggestions.
- Limitations and unsupported checks.
- Model/ruleset/prompt version.
- Button to request re-review after new revision.

Never show a simple green “AI approved” state. Use “AI recommends…” wording.

### H. Approval Inbox
- Pending tasks assigned to current user.
- Due date/SLA age.
- Change summary and AI findings.
- Evidence/document links.
- Approve, Reject, Request Revision actions.
- Comment required for reject/revision.
- Confirmation dialog before decision.

### I. Workflow Timeline
Show ordered approval steps, assignee, role, decision, timestamp, comment, and pending state.

### J. Change Calendar
Month/week/list views. Color by risk/status. Filters and overlap warnings. Do not imply actual device impact without inventory data.

### K. Implementation & PIR
- Actual start/end.
- Implementer.
- Pre-check/post-check.
- Outcome.
- Evidence attachments.
- Rollback performed.
- PIR notes and closure.

### L. Admin
- User/role assignments.
- Workflow definitions.
- Risk thresholds/weights.
- Document type requirements.
- AI provider/model config.
- Ruleset and baseline versions.
- Notification/SLA config.

## 4. UX Rules

- Use skeleton/loading states for async work.
- Poll or use server events for review job status.
- Show empty, error, and retry states.
- Confirm destructive/cancel actions.
- Preserve unsaved form data where practical.
- Do not rely on color alone; include text labels/icons.
- Every finding must show why it was raised.
- Show when analysis is incomplete or stale.
- Use Indonesian as default UI language; keep architecture ready for English localization.
