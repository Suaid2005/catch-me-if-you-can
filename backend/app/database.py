
"""
Sets up an async SQLAlchemy engine and session factory.

SQLite is used for local development.
PostgreSQL is used for production.
"""

import os
import ssl

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()
db_url = settings.async_database_url

engine_kwargs = {
    "echo": settings.is_development and "postgres" not in db_url,
}

if "sqlite" in db_url:
    engine_kwargs["connect_args"] = {"check_same_thread": False}

else:
    # PostgreSQL / Supabase connection pool
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 300

    # Keep the pool small for the free cloud instance
    engine_kwargs["pool_size"] = 2
    engine_kwargs["max_overflow"] = 3

    # Require valid SSL certificates for remote databases
    if "supabase" in db_url or "ssl" in db_url or "render" in db_url:
        ssl_ctx = ssl.create_default_context(
            cafile=os.getenv("DB_SSL_CA_FILE") or None
        )
        engine_kwargs["connect_args"] = {"ssl": ssl_ctx}

engine = create_async_engine(
    db_url,
    **engine_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    import app.models.user  # noqa: F401
    import app.models.room  # noqa: F401
    import app.models.game_history  # noqa: F401
    import app.models.match_state  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Dialect-agnostic backward-compatible schema migration for existing deployments
        def migrate_schema(sync_conn):
            from sqlalchemy import inspect, text
            inspector = inspect(sync_conn)
            dialect_name = sync_conn.dialect.name

            # SEC-03: Advisory transaction lock for PostgreSQL multi-worker concurrency
            if dialect_name == "postgresql":
                sync_conn.execute(text("SELECT pg_advisory_xact_lock(74928153);"))

            if "users" in inspector.get_table_names():
                existing_cols = {col["name"] for col in inspector.get_columns("users")}

                # Format JSON defaults based on target dialect (PostgreSQL vs SQLite)
                if dialect_name == "postgresql":
                    avatars_default = "JSON DEFAULT '[\"avatar_classic_detective\"]'::json"
                    items_default = "JSON DEFAULT '[\"stamp_sus\"]'::json"
                else:
                    avatars_default = "TEXT DEFAULT '[\"avatar_classic_detective\"]'"
                    items_default = "TEXT DEFAULT '[\"stamp_sus\"]'"

                bool_false_default = "BOOLEAN DEFAULT FALSE" if dialect_name == "postgresql" else "BOOLEAN DEFAULT 0"
                bool_true_default = "BOOLEAN DEFAULT TRUE" if dialect_name == "postgresql" else "BOOLEAN DEFAULT 1"

                columns_to_ensure = [
                    ("phone_number", "VARCHAR(32)"),
                    ("coins", "INTEGER DEFAULT 150"),
                    ("xp", "INTEGER DEFAULT 0"),
                    ("level", "INTEGER DEFAULT 1"),
                    ("unlocked_avatars", avatars_default),
                    ("equipped_avatar", "VARCHAR(64) DEFAULT 'avatar_classic_detective'"),
                    ("unlocked_items", items_default),
                    ("equipped_frame", "VARCHAR(64)"),
                    ("equipped_stamp", "VARCHAR(64) DEFAULT 'stamp_sus'"),
                    ("email_verified", bool_false_default),
                    ("phone_verified", bool_false_default),
                    ("is_active", bool_true_default),
                    ("is_legacy", bool_true_default),
                ]

                for col_name, col_def in columns_to_ensure:
                    if col_name not in existing_cols:
                        try:
                            if dialect_name == "postgresql":
                                sync_conn.execute(text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col_name} {col_def}"))
                            else:
                                sync_conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}"))
                        except Exception as e:
                            # SEC-03: Gracefully handle duplicate column race conditions in concurrent workers
                            err_msg = str(e).lower()
                            if "duplicate column" in err_msg or "already exists" in err_msg:
                                pass
                            else:
                                raise

        await conn.run_sync(migrate_schema)


async def close_db() -> None:
    """Closes all active connections and disposes the database engine pool."""
    await engine.dispose()
