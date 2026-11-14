"""
app/main.py
───────────
Entry point for the FastAPI application.

What happens here:
1. Create the FastAPI app with metadata (shown in /docs)
2. Mount Socket.IO as an ASGI sub-app (this is what handles WebSocket connections)
3. Add CORS middleware (allows the frontend at localhost:3000 to call this server)
4. Register all REST API routers
5. Create database tables on startup
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio

from app.config import get_settings
from app.database import init_db, close_db
from app.api import auth, rooms, players, progression
from app.socket.server import sio

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once when the server starts (before) and once when it shuts down (after).
    We use it to initialise the database tables.
    """
    print(f"🚀 Starting {settings.app_name} in {settings.app_env} mode...")
    await init_db()
    print("✅ Database tables ready")
    yield
    print("👋 Server shutting down")
    try:
        from app.socket.game_events import cancel_all_game_timers
        cancel_all_game_timers()
    except Exception as e:
        print(f"Warning: error cancelling game timers on shutdown: {e}")
    await close_db()


# Create the FastAPI application
app = FastAPI(
    title="Catch Me If You Can? API",
    description="Real-time multiplayer social deduction game backend",
    version="0.1.0",
    docs_url="/docs" if settings.is_development else None,  # Hide docs in production
    lifespan=lifespan,
)

# CORS middleware — allows the Next.js frontend to make requests to this server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|0\.0\.0\.0)(:\d+)?$|^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register REST API routers — each file handles a group of related endpoints
app.include_router(auth.router,        prefix="/api/auth",        tags=["Authentication"])
app.include_router(rooms.router,       prefix="/api/rooms",       tags=["Rooms"])
app.include_router(players.router,     prefix="/api/players",     tags=["Players"])
app.include_router(progression.router, prefix="/api/progression", tags=["Progression"])


@app.get("/", tags=["Health"])
async def root():
    """Health-check endpoint. Returns 200 if the server is alive."""
    return {"status": "ok", "game": settings.app_name}


@app.get("/health", tags=["Health"])
async def health():
    """Liveness check for Render and monitoring."""
    return {"status": "healthy", "env": settings.app_env, "version": "0.1.0"}


@app.get("/ready", tags=["Health"])
async def readiness():
    """
    Readiness check that verifies both FastAPI process and Database connectivity.
    Returns HTTP 200 when fully ready, 503 if database connection fails.
    """
    from sqlalchemy import text
    from fastapi.responses import JSONResponse
    from app.database import engine

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {
            "status": "ready",
            "database": "connected",
            "app": settings.app_name,
            "port": settings.port,
        }
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "database": "unreachable",
                "error": str(e) if settings.is_development else "Database connection failed",
            },
        )


# Mount Socket.IO ASGI app alongside FastAPI.
# Socket.IO handles all WebSocket connections for real-time multiplayer.
# It wraps the FastAPI app so both REST and WebSocket share one server process.
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
