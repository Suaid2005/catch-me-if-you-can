"""
app/database.py
───────────────
Sets up an async SQLAlchemy engine and session factory.

Why async? FastAPI is async-first. Using async SQLAlchemy means the server
can handle hundreds of simultaneous players without waiting on slow DB queries.

For development we use SQLite (zero config).
For production, swap DATABASE_URL to a PostgreSQL URL in .env.
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import ssl

from app.config import get_settings

settings = get_settings()

db_url = settings.async_database_url

# Configure database engine parameters
engine_kwargs = {
    # Disable query echoing in production to protect secret words and user credentials
    "echo": settings.is_development and not ("postgres" in db_url),
}

if "sqlite" in db_url:
    # SQLite-specific: allow multithreaded connection sharing
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL / Supabase configuration:
    # 1. pool_pre_ping: detects dropped pooled connections (e.g. Supabase paused or restarted)
    # 2. pool_recycle: refreshes idle connections before cloud proxies terminate them
    # 3. pool_size & max_overflow: optimized for high concurrency with zero timeouts
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 300
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

    # Handle SSL for remote cloud databases (Supabase, Render, AWS, Neon)
    if "supabase" in db_url or "ssl" in db_url or "render" in db_url:
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
        engine_kwargs["connect_args"] = {"ssl": ssl_ctx}

# create_async_engine: the connection pool to the database
engine = create_async_engine(
    db_url,
    **engine_kwargs
)

# async_sessionmaker: a factory that creates individual DB sessions
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """All SQLAlchemy models inherit from this Base class."""
    pass


async def get_db() -> AsyncSession:
    """
    FastAPI dependency — inject a DB session into any route function.

    Usage in a route:
        async def my_route(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables that don't exist yet. Called on app startup."""
    # Import all models here so SQLAlchemy knows about them before creating tables
    import app.models.user          # noqa: F401
    import app.models.room          # noqa: F401
    import app.models.game_history  # noqa: F401
    import app.models.match_state   # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
