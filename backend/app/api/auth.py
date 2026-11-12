"""
app/api/auth.py
────────────────
Authentication endpoints:
  POST /api/auth/register   → create a new account
  POST /api/auth/login      → get a JWT token
  POST /api/auth/guest      → create a temporary guest session
  GET  /api/auth/me         → get the current user's profile

Security notes:
- Passwords are hashed with bcrypt (via passlib) before storing
- We issue JWTs (JSON Web Tokens) instead of server-side sessions
  → JWTs are stateless: the server doesn't need to remember every session
- Tokens expire after ACCESS_TOKEN_EXPIRE_MINUTES (default: 60 min)
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt
import bcrypt

from app.database import get_db
from app.config import get_settings
from app.models.user import User
from app.schemas.user import UserRegister, GuestLogin, UserPublic, TokenResponse

router = APIRouter()
settings = get_settings()

# OAuth2PasswordBearer: tells FastAPI how to extract the JWT from the Authorization header
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

ALGORITHM = "HS256"


# ── Helper Functions ──────────────────────────────────────────────

def hash_password(plain: str) -> str:
    pwd_bytes = plain.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        pwd_bytes = plain.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict) -> str:
    """Create a signed JWT that expires after the configured time."""
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload["exp"] = expire
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    FastAPI dependency: extract and validate a JWT, return the User.
    Raise 401 if the token is missing, expired, or invalid.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


# ── Endpoints ─────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    """Create a new player account."""
    # Check if username is taken
    existing = await db.execute(select(User).where(User.username == payload.username))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        avatar=_pick_avatar(),
    )
    db.add(user)
    await db.flush()  # Get the auto-generated ID before commit

    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user=UserPublic.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Log in with username + password, receive a JWT."""
    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user=UserPublic.model_validate(user))


@router.post("/guest", response_model=TokenResponse)
async def guest_login(payload: GuestLogin, db: AsyncSession = Depends(get_db)):
    """
    Create a temporary guest account. No password required.
    Guest stats are not persisted after the session ends.
    """
    # Append a short random suffix to avoid collisions
    suffix = uuid.uuid4().hex[:4].upper()
    username = f"Guest_{payload.display_name}_{suffix}"[:32]

    user = User(
        username=username,
        is_guest=True,
        avatar=_pick_avatar(),
    )
    db.add(user)
    await db.flush()

    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user=UserPublic.model_validate(user))


@router.get("/me", response_model=UserPublic)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's public profile."""
    return UserPublic.model_validate(current_user)


def _pick_avatar() -> str:
    """Pick a random avatar emoji for a new player."""
    avatars = ["🧑", "👩", "👨", "🧔", "👩‍💼", "👨‍💼", "🕵️", "👩‍🔬", "👨‍🔬", "🦸", "🧙"]
    import random
    return random.choice(avatars)
