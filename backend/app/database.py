
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
