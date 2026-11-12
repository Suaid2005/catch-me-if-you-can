"""
app/schemas/user.py
────────────────────
Pydantic schemas define the shape of data that comes IN (requests)
and goes OUT (responses) through the API.

They are separate from SQLAlchemy models intentionally:
- DB models control HOW data is stored.
- Schemas control WHAT the outside world sees.
  (e.g., we never expose hashed_password in a response schema)
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime


# ── Request schemas (data sent TO the server) ────────────────────

class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=32,
                          pattern=r"^[a-zA-Z0-9_\-]+$",
                          description="Letters, numbers, _ and - only")
    email: EmailStr | None = None
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def username_not_reserved(cls, v: str) -> str:
        reserved = {"admin", "bot", "system", "moderator", "guest"}
        if v.lower() in reserved:
            raise ValueError(f"'{v}' is a reserved username")
        return v


class UserLogin(BaseModel):
    username: str
    password: str


class GuestLogin(BaseModel):
    """Guest players pick a display name but create no permanent account."""
    display_name: str = Field(..., min_length=2, max_length=20)


# ── Response schemas (data sent FROM the server) ──────────────────

class UserPublic(BaseModel):
    """Safe public view of a user — never includes password or email."""
    id: str
    username: str
    avatar: str
    games_played: int
    games_won: int
    is_guest: bool

    model_config = {"from_attributes": True}


class UserStats(UserPublic):
    """Extended stats for a player's profile page."""
    times_caught: int
    times_escaped: int
    win_rate: float = 0.0

    model_config = {"from_attributes": True}

    @property
    def computed_win_rate(self) -> float:
        if self.games_played == 0:
            return 0.0
        return round(self.games_won / self.games_played * 100, 1)


class TokenResponse(BaseModel):
    """Returned after a successful login."""
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
