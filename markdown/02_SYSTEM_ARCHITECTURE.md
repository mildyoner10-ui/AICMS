# System Architecture & Technical Design

## 1. Architecture Principles

- Modular monolith untuk MVP; pisahkan domain melalui module boundaries.
- API-first.
- Asynchronous processing untuk file parsing dan AI review.
- Deterministic validation sebelum/bersama LLM reasoning.
- AI provider abstraction.
- Least privilege dan deny-by-default.
- Human-in-the-loop untuk seluruh keputusan.
- No device write/execute capability pada MVP.

## 2. Logical Components

### Frontend
Next.js + TypeScript:
- Dashboard
- Change Request
- Document Center
- AI Review
- Approval Inbox
- Change Calendar
- Implementation/PIR
- Administration

### Backend API
FastAPI:
- Auth/RBAC
- Change service
- Document service
- Review orchestration
- Risk service
- Workflow service
- Calendar service
- Audit service
- Reporting service

### Background Worker
- Malware scan orchestration.
- Text extraction/OCR.
- Config parser invocation.
- Rule evaluation.
- LLM review.
- Risk calculation.
- Notifications.

### Data Services
- PostgreSQL: transactional data.
- Object storage: original files and derived artifacts.
- Redis: queue/cache/short-lived coordination.
- Optional pgvector: retrieval over approved standards and runbooks.

## 3. Suggested Repository Structure

```text
aicms/
  apps/
    web/                    # Next.js frontend
    api/                    # FastAPI backend
    worker/                 # async jobs
  packages/
    ui/                     # shared UI components
    contracts/               # OpenAPI/client schemas if shared
  infra/
    docker/
    migrations/
    scripts/
  docs/
  sample-data/
    sample-rfcs/
    sample-configs/
  tests/
    e2e/
    integration/
  .env.example
  docker-compose.yml
  README.md
```

## 4. Backend Domain Modules

```text
app/
  core/                     # config, logging, errors
  auth/
  users/
  roles/
  changes/
  documents/
  reviews/
  config_validation/
  risk/
  workflows/
  approvals/
  calendar/
  implementation/
  audit/
  notifications/
  integrations/
```

Keep business logic in service/domain layers, not directly inside API route handlers.

## 5. Core Data Flow

1. User submits RFC.
2. API validates fields and creates immutable submission snapshot.
3. User uploads documents; files are scanned and stored.
4. User requests AI review.
5. API creates review job and returns job ID.
6. Worker extracts text/config, parses supported formats, runs deterministic rules, and invokes LLM for contextual analysis.
7. Worker stores findings and risk assessment against snapshot IDs.
8. Workflow engine evaluates routing rules and creates approval tasks.
9. Approvers decide; every decision creates an audit event.
10. Approved change is scheduled and later implemented by authorized human/operator.
11. User uploads execution evidence and completes PIR.

## 6. AI Service Boundary

Define an interface such as:

```python
class ReviewProvider:
    async def analyze(self, request: ReviewRequest) -> ReviewResult:
        ...
```

Provider adapters must normalize output to an internal schema. Do not let provider-specific JSON leak into core domain logic.

## 7. Integration Strategy

MVP:
- Email notification adapter (development console adapter initially).
- Local/sample inventory adapter.
- No direct device write access.

Later:
- NetBox read-only inventory/topology.
- SolarWinds read-only health/performance.
- Cisco APIC read-only queries.
- F5 BIG-IP read-only inventory/config retrieval.
- ITSM/CMDB and enterprise messaging.

Each integration requires:
- Explicit service account.
- Read-only permission by default.
- Timeout, retry, rate limit, and circuit breaker.
- Credential vault/secret manager.
- Audit of integration access.
- Data freshness timestamp and source attribution.

## 8. Deployment

Development:
- Docker Compose.
- PostgreSQL, Redis, MinIO, API, worker, web.

Production:
- Container platform or approved VM/Kubernetes platform.
- TLS termination.
- Managed/HA database where available.
- Private object storage.
- Central secrets management.
- Central logging and monitoring.
- Network segmentation between web, API, worker, database, and integration zones.

## 9. Key Architecture Decisions

| Decision | MVP Choice | Rationale |
|---|---|---|
| Architecture | Modular monolith | Simpler delivery and deployment |
| AI execution | Background worker | Avoid HTTP timeout |
| File storage | S3-compatible | Versioning and scalable storage |
| Database | PostgreSQL | Transactions and relational workflow |
| Config analysis | Parser + rules + LLM | Explainable and safer than LLM-only |
| Device changes | Out of scope | Prevent unintended production changes |
| Workflow | Configurable state machine | Adapt to approval policy |

## 10. Failure Handling

- AI provider unavailable: review `FAILED` or `RETRY_PENDING`; never silently mark pass.
- Parser unsupported: `NOT_ASSESSED`.
- File extraction failure: finding with processing error; do not infer content.
- Queue failure: retry with bounded attempts and dead-letter handling.
- Duplicate request: idempotency key.
- Partial approval failure: preserve completed decisions and allow controlled resume.
- Stale review: mark stale when source snapshot changes.
