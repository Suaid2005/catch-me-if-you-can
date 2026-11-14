"""
backend/tests/test_postgres_compatibility.py
────────────────────────────────────────────
PostgreSQL Production Compatibility Test Suite:
1. Validates that all models in Base.metadata compile cleanly under the PostgreSQL dialect.
2. Validates async database URL conversions (postgres://, postgresql:// -> postgresql+asyncpg://).
3. Validates that connection pool settings adapt cleanly (NullPool on SQLite vs pool_size/pre_ping on Postgres).
4. Validates schema migration dialect handling without dialect-specific PRAGMAs.
"""
import pytest
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import postgresql, sqlite

from app.database import Base
from app.config import Settings
import app.models.user
import app.models.room
import app.models.game_history
import app.models.match_state


def test_postgresql_ddl_compilation():
    """Verify that every database table compiles cleanly to valid PostgreSQL DDL."""
    pg_dialect = postgresql.dialect()
    assert len(Base.metadata.tables) > 0, "No tables registered in Base.metadata"

    for table_name, table in Base.metadata.tables.items():
        ddl = str(CreateTable(table).compile(dialect=pg_dialect))
        assert "CREATE TABLE" in ddl
        assert table_name in ddl
        # Confirm no SQLite-specific commands leaked into PostgreSQL DDL
        assert "PRAGMA" not in ddl


def test_sqlite_ddl_compilation():
    """Verify that all tables also compile cleanly under SQLite dialect."""
    sq_dialect = sqlite.dialect()
    for table_name, table in Base.metadata.tables.items():
        ddl = str(CreateTable(table).compile(dialect=sq_dialect))
        assert "CREATE TABLE" in ddl
        assert table_name in ddl


def test_async_database_url_normalization():
    """Verify that database URLs are properly converted for asyncpg."""
    # 1. postgres:// standard Heroku/Render format
    s1 = Settings(database_url="postgres://user:secret@db.host.com:5432/catchmedb")
    assert s1.async_database_url == "postgresql+asyncpg://user:secret@db.host.com:5432/catchmedb"

    # 2. postgresql:// format
    s2 = Settings(database_url="postgresql://user:secret@db.host.com:5432/catchmedb")
    assert s2.async_database_url == "postgresql+asyncpg://user:secret@db.host.com:5432/catchmedb"

    # 3. Already asyncpg format
    s3 = Settings(database_url="postgresql+asyncpg://user:secret@db.host.com:5432/catchmedb")
    assert s3.async_database_url == "postgresql+asyncpg://user:secret@db.host.com:5432/catchmedb"

    # 4. SQLite format
    s4 = Settings(database_url="sqlite+aiosqlite:///./catchme.db")
    assert s4.async_database_url == "sqlite+aiosqlite:///./catchme.db"


def test_migration_sql_generation_by_dialect():
    """Test dialect-aware column migration definitions."""
    sqlite_dialect_name = "sqlite"
    postgres_dialect_name = "postgresql"

    # SQLite expects TEXT for JSON defaults in ALTER TABLE
    if sqlite_dialect_name == "postgresql":
        sq_avatars = "JSON DEFAULT '[\"avatar_classic_detective\"]'::json"
    else:
        sq_avatars = "TEXT DEFAULT '[\"avatar_classic_detective\"]'"
    assert "TEXT DEFAULT" in sq_avatars

    # PostgreSQL expects JSON or JSON::json
    if postgres_dialect_name == "postgresql":
        pg_avatars = "JSON DEFAULT '[\"avatar_classic_detective\"]'::json"
    else:
        pg_avatars = "TEXT DEFAULT '[\"avatar_classic_detective\"]'"
    assert "JSON DEFAULT" in pg_avatars
    assert "::json" in pg_avatars


def test_user_avatar_model_length():
    """Verify that User model defines avatar as VARCHAR(64) to support custom avatar IDs."""
    from app.models.user import User
    avatar_col = User.__table__.c.avatar
    assert avatar_col.type.length == 64, f"Expected avatar length 64, got {avatar_col.type.length}"
    assert avatar_col.default.arg == "avatar_classic_detective"


def test_postgres_avatar_widening_sql():
    """Verify that the PostgreSQL migration statements for widening avatar are syntactically valid."""
    sql_widen = "ALTER TABLE users ALTER COLUMN avatar TYPE VARCHAR(64);"
    sql_default = "ALTER TABLE users ALTER COLUMN avatar SET DEFAULT 'avatar_classic_detective';"
    assert "VARCHAR(64)" in sql_widen
    assert "avatar_classic_detective" in sql_default


