# Database Design

PostgreSQL is the transactional source of truth. Use UUID primary keys, UTC timestamps, created_at/updated_at, and explicit foreign keys. Use migrations; do not create production schema manually.

## 1. Main Entities

### users
- id UUID PK
- username unique
- email unique
- display_name
- is_active
- auth_provider
- created_at, updated_at

### roles
- id UUID PK
- code unique (REQUESTER, ENGINEER, TECH_REVIEWER, MANAGER, CHANGE_MANAGER, CAB_MEMBER, FINAL_APPROVER, AUDITOR, ADMIN, AI_ADMIN)
- name
- description

### user_roles
- user_id FK users
- role_id FK roles
- scope_type nullable
- scope_id nullable
- composite unique(user_id, role_id, scope_type, scope_id)

### changes
- id UUID PK
- change_number unique
- title
- description
- category
- change_type
- business_justification
- affected_services JSONB
- affected_devices JSONB
- environment
- implementation_start, implementation_end
- impact_description
- implementation_plan
- test_plan
- rollback_plan
- communication_plan
- requester_id FK users
- status
- current_revision
- created_at, updated_at, submitted_at

### change_revisions
- id UUID PK
- change_id FK changes
- revision_number
- snapshot JSONB
- content_hash
- created_by FK users
- created_at
- unique(change_id, revision_number)

### documents
- id UUID PK
- change_id FK changes
- revision_id FK change_revisions nullable
- original_filename
- object_key
- mime_type
- size_bytes
- sha256
- document_type
- version_number
- scan_status
- extraction_status
- uploaded_by FK users
- uploaded_at
- unique(change_id, original_filename, version_number)

### review_jobs
- id UUID PK
- change_id FK changes
- revision_id FK change_revisions
- status (QUEUED, RUNNING, COMPLETED, FAILED, STALE)
- provider
- model_name
- prompt_version
- ruleset_version
- started_at, completed_at
- error_code, error_message
- created_by FK users

### review_results
- id UUID PK
- review_job_id FK review_jobs unique
- recommendation
- overall_risk_score numeric
- summary
- limitations JSONB
- result_json JSONB
- created_at

### findings
- id UUID PK
- review_result_id FK review_results
- check_category
- check_name
- status (PASS, WARN, FAIL, NOT_ASSESSED)
- severity (INFO, LOW, MEDIUM, HIGH, CRITICAL)
- title
- description
- evidence JSONB
- remediation
- confidence numeric nullable
- created_at

### risk_assessments
- id UUID PK
- change_id FK changes
- revision_id FK change_revisions
- formula_version
- score numeric
- risk_level
- factors JSONB
- hard_blockers JSONB
- calculated_at

### workflow_definitions
- id UUID PK
- name
- version
- enabled
- routing_rules JSONB
- created_at

### workflow_instances
- id UUID PK
- change_id FK changes
- revision_id FK change_revisions
- workflow_definition_id FK workflow_definitions
- status
- current_step
- started_at, completed_at

### approval_tasks
- id UUID PK
- workflow_instance_id FK workflow_instances
- step_code
- assigned_role_id FK roles nullable
- assigned_user_id FK users nullable
- status (PENDING, APPROVED, REJECTED, REVISION_REQUESTED, CANCELLED, DELEGATED)
- due_at
- decided_by FK users nullable
- decision
- comment
- decided_at
- created_at

### implementation_records
- id UUID PK
- change_id FK changes
- actual_start, actual_end
- implementer_id FK users
- outcome
- execution_notes
- precheck JSONB
- postcheck JSONB
- rollback_performed boolean
- created_at

### audit_events
- id UUID PK
- actor_user_id FK users nullable
- actor_type
- action
- object_type
- object_id
- correlation_id
- event_data JSONB
- occurred_at
- Append-only at application/database permission level.

### notifications
- id UUID PK
- recipient_user_id FK users
- channel
- template_code
- payload JSONB
- status
- sent_at
- created_at

## 2. Relationships

```text
users --< changes (requester)
changes --< change_revisions
changes --< documents
change_revisions --< review_jobs
review_jobs --1 review_results
review_results --< findings
changes --< risk_assessments
changes --< workflow_instances
workflow_instances --< approval_tasks
changes --< implementation_records
users --< audit_events
```

## 3. Indexes

- changes(change_number), changes(status), changes(requester_id), changes(implementation_start)
- documents(change_id), documents(sha256)
- review_jobs(change_id, status)
- findings(review_result_id, severity, status)
- approval_tasks(assigned_user_id, status, due_at)
- audit_events(object_type, object_id, occurred_at)
- audit_events(correlation_id)

## 4. Data Integrity Rules

- Never overwrite original document bytes.
- Each review references an immutable revision and exact document set.
- A new material revision makes previous review `STALE`.
- Approval is tied to workflow instance and revision.
- Final approval cannot proceed with unresolved mandatory blockers unless a formally authorized exception is recorded.
- Audit events are append-only.
- Store timestamps in UTC; render in user timezone.
- Avoid storing secrets extracted from config. Mask/redact before persistence and before sending to AI provider.

## 5. Implementation Notes

- Use SQLAlchemy models and Alembic migrations.
- Use JSONB only for variable structured payloads; keep core searchable fields relational.
- Add optimistic locking/version field for concurrent RFC edits.
- Add soft delete only where policy permits; audit and regulated records should follow retention policy.
