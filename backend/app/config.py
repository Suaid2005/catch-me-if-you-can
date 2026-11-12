"""
app/config.py
─────────────
Loads all configuration from environment variables.
pydantic-settings automatically reads from a .env file in the backend/ directory.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    app_name: str = "CatchMeIfYouCan"
    app_env: str = "development"
    secret_key: str = "CHANGE_ME"
    access_token_expire_minutes: int = 60

    # Server Port (Render injects PORT)
    port: int = 8000

    # Database
    database_url: str = "sqlite+aiosqlite:///./catchme.db"

    # Redis (Optional)
    redis_url: str = "redis://localhost:6379/0"

    # Optional explicit frontend domain (e.g. https://my-catchme.vercel.app)
    frontend_url: str = ""

    # CORS — comma-separated list of allowed origins
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000"

    # ML models
    bot_lm_model: str = "gpt2"
    chat_embed_model: str = "all-MiniLM-L6-v2"
    # Keep False on Render free tier (512MB RAM) for zero-memory cold-starts
    enable_heavy_embeddings: bool = False

    @property
    def async_database_url(self) -> str:
        """
        Normalize database URL for SQLAlchemy Async engine.
        Converts postgres:// or postgresql:// to postgresql+asyncpg://
        """
        url = self.database_url.strip()
        if url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://"):]
        return url

    @property
    def origins_list(self) -> list[str]:
        origins = [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
        if self.frontend_url:
            clean_front = self.frontend_url.strip().rstrip("/")
            if clean_front and clean_front not in origins:
                origins.append(clean_front)
        return origins

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (read once, reused everywhere)."""
    return Settings()
