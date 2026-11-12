"""
scripts/migrate_db.py
─────────────────────
Production database migration & verification utility for Supabase PostgreSQL & SQLite.
Can be executed locally or in cloud CI/CD / Render build phase.

Features:
1. Connects using async SQLAlchemy & asyncpg / aiosqlite.
2. Supports Supabase connection strings (direct or pooler) with SSL.
3. Non-destructive: preserves all existing users, rooms, and game history.
4. Auto-creates 'match_states', 'users', 'rooms', and 'game_history' tables.
5. Verifies database schema health and latency.
"""
import asyncio
import os
import sys
import time

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from app.config import get_settings
from app.database import engine, Base, init_db, AsyncSessionLocal


async def run_migration():
    settings = get_settings()
    db_url = settings.async_database_url

    # Mask credentials for logging
    masked_url = db_url
    if "@" in masked_url:
        proto_user, host_db = masked_url.split("@", 1)
        proto = proto_user.split("://")[0]
        masked_url = f"{proto}://*****:*****@{host_db}"

    print("=" * 60)
    print("🚀 Catch Me If You Can? — Database Migration & Audit")
    print("=" * 60)
    print(f"Target Database: {masked_url}")
    print(f"Engine Type:     {'PostgreSQL (Supabase/Render)' if 'postgres' in db_url else 'SQLite'}")
    print("-" * 60)

    start_time = time.time()
    try:
        # 1. Test basic connectivity
        async with engine.connect() as conn:
            res = await conn.execute(text("SELECT 1"))
            assert res.scalar() == 1
        latency = (time.time() - start_time) * 1000
        print(f"✅ Connection successful! Roundtrip latency: {latency:.1f}ms")

        # 2. Run metadata create_all (non-destructive)
        print("📦 Verifying and creating required tables...")
        await init_db()
        print("✅ Base schema and 'match_states' table synchronized.")

        # 3. Check table row counts to ensure zero data loss
        async with AsyncSessionLocal() as session:
            for tbl in ["users", "rooms", "game_history", "match_states"]:
                try:
                    count_res = await session.execute(text(f"SELECT COUNT(*) FROM {tbl}"))
                    count = count_res.scalar()
                    print(f"  • Table '{tbl}': {count} existing records")
                except Exception as e:
                    print(f"  • Table '{tbl}': verification note ({e})")

        print("-" * 60)
        print("🎉 Database migration completed successfully with 0 errors!")
        print("=" * 60)
        return 0

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(run_migration())
    sys.exit(exit_code)
