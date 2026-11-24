# API Specification (Initial Contract)

Base path: `/api/v1`  
Format: JSON. Authentication: bearer token/OIDC session. All endpoints require authorization unless explicitly marked public.

## 1. Common Conventions

- UUID identifiers.
- UTC ISO-8601 timestamps.
- Pagination: `page`, `page_size`; response includes `total`.
- Error shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{"field": "title", "issue": "Required"}],
    "correlation_id": "..."
  }
}
```

- Mutating requests should support `Idempotency-Key` where relevant.
- Use `ETag`/revision number or `If-Match` for concurrent updates.

## 2. Authentication & Users

- `GET /auth/me` – current user and roles.
- `GET /users` – admin list users.
- `GET /roles` – list roles.
- `PUT /users/{user_id}/roles` – admin assign roles.

## 3. Change Requests

- `POST /changes` – create draft.
- `GET /changes` – list/filter.
- `GET /changes/{change_id}` – detail.
- `PATCH /changes/{change_id}` – update draft/revision.
- `POST /changes/{change_id}/submit` – validate and submit.
- `POST /changes/{change_id}/cancel` – cancel with reason.
- `GET /changes/{change_id}/history` – status/revision history.

Example create:

```json
{
  "title": "Core switch BGP policy update",
  "category": "NETWORK",
  "change_type": "NORMAL",
  "business_justification": "Improve route preference for DC resiliency",
  "affected_services": ["Core connectivity"],
  "affected_devices": ["CORE-SW-01"],
  "environment": "PRODUCTION",
  "implementation_start": "2026-12-01T18:00:00Z",
  "implementation_end": "2026-12-01T20:00:00Z",
  "impact_description": "Possible traffic path change",
  "implementation_plan": "Approved MOP reference",
  "test_plan": "Verify BGP neighbors and route table",
  "rollback_plan": "Restore prior route policy"
}
```

## 4. Documents

- `POST /changes/{change_id}/documents` – upload multipart file.
- `GET /changes/{change_id}/documents` – list document versions.
- `GET /documents/{document_id}` – metadata.
- `GET /documents/{document_id}/download` – authorized download.
- `POST /documents/{document_id}/reprocess` – retry scan/extraction (privileged).

Upload response includes `document_id`, `sha256`, `version_number`, `scan_status`, and `extraction_status`.

## 5. AI Reviews

- `POST /changes/{change_id}/reviews` – enqueue review for current revision.
- `GET /reviews/{review_id}` – job status and result.
- `GET /changes/{change_id}/reviews` – review history.
- `POST /reviews/{review_id}/retry` – retry failed review if permitted.

Example response:

```json
{
  "id": "uuid",
  "status": "COMPLETED",
  "recommendation": "REQUEST_REVISION",
  "overall_risk_score": 62,
  "summary": "Rollback evidence is incomplete.",
  "findings": [
    {
      "category": "ROLLBACK",
      "status": "FAIL",
      "severity": "HIGH",
      "title": "Rollback validation steps missing",
      "description": "The rollback document does not define post-rollback checks.",
      "evidence": [{
        "document_id": "uuid",
        "filename": "rollback.pdf",
        "page": 3,
        "quote": "Restore previous route policy"
      }],
      "remediation": "Add route verification and service reachability checks."
    }
  ],
  "limitations": ["Device topology was not connected; impact analysis is document-based."]
}
```

## 6. Approval Workflow

- `GET /approvals/inbox` – current user's pending tasks.
- `GET /approvals/{task_id}` – task detail.
- `POST /approvals/{task_id}/decision` – approve/reject/request revision.
- `POST /approvals/{task_id}/delegate` – delegate if policy permits.
- `GET /changes/{change_id}/workflow` – workflow progress.

Decision body:

```json
{
  "decision": "APPROVE",
  "comment": "Reviewed technical findings and attached evidence."
}
```

Valid decisions: `APPROVE`, `REJECT`, `REQUEST_REVISION`.

## 7. Calendar & Implementation

- `GET /calendar/changes?from=...&to=...`
- `POST /changes/{change_id}/implementation`
- `PATCH /implementation/{record_id}`
- `POST /changes/{change_id}/close`
- `POST /changes/{change_id}/pir`

## 8. Dashboard & Audit

- `GET /dashboard/summary`
- `GET /dashboard/risk-distribution`
- `GET /dashboard/approval-aging`
- `GET /audit-events?object_type=CHANGE&object_id=...`

## 9. API Security

- Validate role and object-level authorization on every endpoint.
- Never trust user-supplied `requester_id`, approver role, risk score, or workflow status.
- Validate file extension, MIME, magic bytes, size, and malware scan result.
- Rate limit upload and AI review endpoints.
- Redact secrets from logs.
- Return no internal stack traces to clients.
