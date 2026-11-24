"""Shared fixtures: run against real Postgres in an isolated, per-test schema.

The schema name is baked into each connection's search_path through asyncpg
server_settings, so it survives transaction commits (a plain SET would not).
"""

import os
import uuid as _uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Reviews run in-process in tests: no Redis/RQ needed. Must be set before app config loads.
os.environ.setdefault("REVIEW_MODE", "inline")

from app.db.session import Base, get_async_session  # noqa: E402
from app.main import app  # noqa: E402

BASE_DB_URL = os.getenv("TEST_DATABASE_URL", os.getenv("DATABASE_URL"))
if not BASE_DB_URL:
    pytest.skip("Set DATABASE_URL (or TEST_DATABASE_URL) to a Postgres instance", allow_module_level=True)


@pytest_asyncio.fixture
async def schema():
    """Create an empty schema before the engine binds its search_path to it."""
    name = f"t_{_uuid.uuid4().hex[:12]}"
    admin = create_async_engine(BASE_DB_URL, echo=False)
    async with admin.begin() as conn:
        await conn.execute(text(f"CREATE SCHEMA {name}"))
    await admin.dispose()

    yield name

    admin = create_async_engine(BASE_DB_URL, echo=False)
    async with admin.begin() as conn:
        await conn.execute(text(f"DROP SCHEMA IF EXISTS {name} CASCADE"))
    await admin.dispose()


@pytest_asyncio.fixture
async def engine(schema):
    engine = create_async_engine(
        BASE_DB_URL,
        echo=False,
        connect_args={"server_settings": {"search_path": f"{schema}"}},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def session(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        yield s


@pytest_asyncio.fixture
async def client(session):
    async def get_session_override():
        yield session

    app.dependency_overrides[get_async_session] = get_session_override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
