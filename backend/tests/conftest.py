"""
backend/tests/conftest.py
─────────────────────────
Test configuration for backend test suite.
Configures an isolated in-memory SQLite database using StaticPool so all
connections during a test share the exact same in-memory database schema and data,
preventing any access or locking of the local persistent 'catchme.db' file.
"""
import os
import sys
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

# Ensure backend root is on sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["APP_ENV"] = "testing"

import app.database
from app.database import Base, init_db, close_db

# Create isolated in-memory SQLite engine with StaticPool
test_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

test_sessionmaker = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Rebind app.database module references for all tests
app.database.engine = test_engine
app.database.AsyncSessionLocal = test_sessionmaker


@pytest_asyncio.fixture
async def setup_db():
    """
    Initializes a fresh isolated in-memory database before each test,
    and guarantees complete cleanup (drop all tables + close connections)
    after the test finishes, even on test failure.
    """
    await init_db()
    try:
        yield
    finally:
        try:
            async with app.database.engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
        except Exception:
            pass
        await close_db()
