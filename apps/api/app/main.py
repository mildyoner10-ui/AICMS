"""AICMS API - AI Change Management System"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging_config import log
from app.db.session import engine
from app.routes import auth, users, changes, documents, reviews, reviews_list, approvals, calendar, implementation, audit, dashboard, reports


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("AICMS API starting up")
    # Initialize database tables if not exists (dev only)
    # In production, use Alembic
    yield
    log.info("AICMS API shutting down")


app = FastAPI(
    title="AICMS API",
    description="AI Change Management System - Enterprise IT Infrastructure Change Management",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    log.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
    )


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/v1/health")
async def health_v1():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/v1/ai/status")
async def ai_status():
    """Which review provider is active, so the UI can label results honestly."""
    from app.integrations.ai.review_provider import provider_status

    return provider_status()


# Register routes
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(changes.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(reviews.router, prefix="/api/v1")
app.include_router(reviews_list.router, prefix="/api/v1")
app.include_router(approvals.router, prefix="/api/v1")
app.include_router(calendar.router, prefix="/api/v1")
app.include_router(implementation.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
