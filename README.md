# AICMS – AI Change Management System

Enterprise web application for IT infrastructure change management. RFC creation, secure document upload/versioning, async AI-assisted review, deterministic risk scoring, multi-level approval, audit trail, change calendar, implementation tracking, and post-implementation review.

## Quick Start

```bash
# Start stack (postgres, redis, api, worker, web)
docker compose up -d --build

#eksekusi ini jika ada isu di db postgre
sudo docker compose exec api alembic upgrade head
# API + worker containers auto-run: alembic upgrade head, seed.py, uvicorn
# Web serves on http://localhost:3000, API on http://localhost:8000
```

Open http://localhost:3000 — log in with `admin` / `Admin@123`.

> Host ports: postgres `15432`, redis `16001`, api `8000`, web `3000`. Windows Hyper-V
> reserves `5141–5940` so `5432`/`6379` are unusable on the host.

## Running tests

Tests need live Postgres (compose `postgres` service). Run from repo root:

```bash
docker run --rm --network aicms_default \
  -e DATABASE_URL=postgresql+asyncpg://aicms:aicms_dev_secret@postgres:5432/aicms \
  -e JWT_SECRET=dev-secret-change-in-production -e ALLOW_LOCAL_LOGIN=true \
  -v "$PWD/apps/api:/app" -v "$PWD/tests:/tests" -w /app aicms-api \
  sh -c "pip install -q pytest pytest-asyncio && python -m pytest /tests -c /tests/pytest.ini -q"
```

## Default Dev Credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `Admin@123` |
| Requester | `requester1` | `Request@123` |
| Technical Reviewer | `reviewer1` | `Reviewer@123` |
| Manager | `manager1` | `Manager@123` |
| Change Manager | `cm1` | `CM@123` |

## Stack

- Frontend: Next.js 14+ (App Router) + TypeScript + Bootstrap 5.3
- Backend: FastAPI + Python 3.12 + SQLAlchemy async + Alembic
- Database: PostgreSQL 16
- Queue: Redis + RQ
- Storage: local disk (dev); S3/MinIO adapter code present (add an S3 service when reachable — Docker Hub blocks `minio/minio` here)
- Auth: JWT (dev), OIDC adapter (prod)
- AI: Provider interface with mock fallback

## Project Structure

```
apps/
├── web/          Next.js frontend
├── api/          FastAPI backend
└── worker/       RQ async jobs
tests/
├── api/          API tests
├── unit/         Domain unit tests
└── e2e/          End-to-end tests
```

## Environment

Copy `.env.example` to `.env` at the repo root (compose reads it). Never commit real secrets.

### AI provider configuration

`AI_PROVIDER` picks the review engine:

| `AI_PROVIDER` | Behaviour |
| --- | --- |
| `mock` (default) | Deterministic heuristics, no network. Every review is labelled **DEMO/MOCK**. |
| `openai` | Any OpenAI-compatible `/chat/completions` endpoint: OpenAI, an Azure/proxy gateway, Ollama (`http://host:11434/v1`), vLLM, LM Studio, etc. |

Settings (`openai` only): `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_TEMPERATURE`, `AI_MAX_TOKENS`,
`AI_TIMEOUT_SECONDS`, `AI_MAX_DOCUMENTS`, `AI_MAX_DOCUMENT_CHARS`. Legacy `OPENAI_API_KEY` /
`OPENAI_MODEL` are still read as fallbacks.

```env
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

After changing `.env`, restart the API and worker:

```powershell
docker compose up -d --force-recreate api worker
```

The active provider is exposed at `GET /api/v1/ai/status` and shown as a badge in the app header, so a
real-model review is never mistaken for the mock. Even with a real model, the AI stays advisory: its
output is schema-validated, unverifiable checks stay `NOT_ASSESSED`, and it never approves or executes
anything. A missing key or unreachable endpoint fails the review job instead of falling back silently.

### Prompt versions

The system prompt is a file, not hardcoded. Edit or add files in `apps/api/prompts/`:

- `v1.txt` — original English prompt.
- `v2.txt` — Indonesian-output variant (default in `.env.example`).

Set `AI_PROMPT_VERSION` in `.env` to the filename without `.txt`, then recreate the API and worker:

```powershell
docker compose up -d --force-recreate api worker
```

Every review records the active prompt and ruleset versions (`prompt_version`, `ruleset_version`).
An unknown version fails loudly; it never silently falls back.


## MVP Acceptance

1. Login with role assignment
2. Create/submit/edit RFC
3. Upload documents with versioning
4. Async AI review with findings
5. Approval workflow with SoD
6. Dashboard, calendar, audit trail
7. Implementation record & PIR

## Development Notes

- AI provider is mock by default. Label: `DEMO/MOCK`. Never fabricates real review.
- No device config push. MVP records human-led execution.
- All uploaded content treated as untrusted data.
- Every AI finding cites evidence from documents or deterministic validator output.
- Unsupported config/platform → `NOT_ASSESSED`, never silently PASS.

## Lifecycle rules (Stage 2)

- States and guards follow `markdown/06_WORKFLOW_AND_APPROVAL.md`. `app/services/workflow_service.py`
  is the only place a change status is written.
- Submitting locks a revision snapshot (`change_revisions.locked_at`); locked revisions are never
  mutated — editing a reopened draft creates the next revision.
- Every status change appends a `change_status_transitions` row (from, to, actor, reason, revision).
- A new revision marks earlier reviews `STALE` and cancels outstanding approval tasks.
- Approval tasks are bound to a revision; a task for a superseded revision is rejected with 409.
- Implementation is gated: `APPROVED`/`SCHEDULED` **and** current revision == approved revision.
- Tests run in a throwaway Postgres schema per test (`tests/conftest.py`); the dev schema is untouched.

## Approval workflow (Stage 3)

- Routing lives in `app/services/approval_matrix.py`: change type + review risk level pick the
  ordered role chain. Unassessed risk never routes as LOW. Emergency has its own short route.
- `workflow_service.ensure_workflow()` creates the workflow and one task per step when a change
  enters `PENDING_APPROVAL`, bound to that revision.
- Steps are **sequential**: only the lowest pending `step_order` is actionable; later steps return
  409 (`An earlier approval step is still pending`). Timing out never approves anything.
- Decisions are immutable; reject / request-revision require a comment; requester can never
  approve their own change; a task on a superseded revision is refused with 409.
- The change moves to `APPROVED` only when every step has approved, and records
  `approved_revision_id` for the execution gate.
- Review now persists a `risk_assessments` row per revision (`risk_service.create_risk_assessment`)
  so routing and the UI have a real risk level instead of the raw result JSON.
- UI: `/approvals` inbox and `/approvals/[id]` detail (RFC, step chain, decision buttons).

## Documents & AI review (Stage 4)

- Upload extracts text (`app/services/document_extract.py`): TXT/CFG/YAML/JSON/XML/CSV, PDF, DOCX,
  XLSX. Unsupported types are `NOT_ASSESSED`, never silently passed.
- Secrets are **redacted before anything leaves the process**: `password X`, `snmp-server community X`,
  `enable secret`, `api_key = X`, bearer tokens, private keys become `[REDACTED]`. Stored evidence
  holds the redacted line, so a leaked credential never comes back through the API.
- Uploaded text and RFC free-text fields are screened for prompt injection (`injection_hits`). Hits
  raise a `SECURITY` finding with `human_validation_required=true`; they are never obeyed.
- Every document finding cites `document_id` + `filename` (+ `line`/`section`) and a snippet.
  Findings about RFC fields cite the field name.
- Checks needing a vendor parser, topology, or an approved baseline are `NOT_ASSESSED` with a reason
  and remediation — a missing capability is never reported as PASS.
- Provider output is validated against a strict schema (`validate_review_output`); unknown
  recommendation or finding status is rejected, not coerced.
- Reviews run on the **RQ worker** (`app/worker/jobs.py`, queue `aicms`, `python -m app.worker`).
  Submit returns `review_mode: "rq"` and the change advances to `PENDING_APPROVAL` /
  `REVISION_REQUIRED` when the worker finishes. `REVIEW_MODE=inline` runs it in-request (tests/dev).
- Review jobs record `provider`, `prompt_version`, `ruleset_version`, document hashes, and the
  `DEMO/MOCK` label. Mock provider is deterministic and labelled everywhere it appears.
- UI: the change detail page shows the AI review panel (badge `DEMO/MOCK`, recommendation, score,
  findings with evidence, limitations) and polls while the review is `QUEUED`/`RUNNING`.
- AI stays advisory: no approval, rejection, workflow transition, or device action originates here.
