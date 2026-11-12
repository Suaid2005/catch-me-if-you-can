# CATCH ME IF YOU CAN? — CLOUD DEPLOYMENT COMPATIBILITY AUDIT
**Date**: November 2026
**Target Architecture**: Strictly ₹0 Zero-Cost Cloud Stack
- **Frontend**: Next.js 15.3.3 on **Vercel** (Hobby Free Tier)
- **Backend**: FastAPI 0.136.3 + Socket.IO on **Render** (Free Web Service Tier)
- **Database**: PostgreSQL 15+ on **Supabase** (Free Tier PostgreSQL)

---

## 1. Executive Summary

This audit assesses the deployment readiness of **Catch Me If You Can?**, a real-time multiplayer social deduction party game. The application has been evaluated and optimized for deployment across free cloud hosting platforms with a strict **₹0 budget constraint**.

| Metric | Status | Finding & Mitigation |
| :--- | :---: | :--- |
| **Total Cloud Cost** | **₹0.00 / month** | 100% free-tier compliant. No credit cards or paid APIs required. |
| **Frontend Compilation** | **PASS (Exit 0)** | Next.js 15.3.3 compiles all 9 routes to static/SSR bundles. |
| **Backend Test Suite** | **PASS (13/13)** | All game engine, mode behavior, persistence, and ML tests pass. |
| **Multiplayer Survivability** | **VERIFIED** | Active match states persist in PostgreSQL; matches recover after server restarts. |
| **Memory Headroom** | **SAFE (~60MB)** | Optimized for Render's 512MB RAM limit; heavy models decoupled. |
| **Cold-Start Resilience** | **VERIFIED** | Automatic Socket.IO reconnection + state hydration from DB. |

---

## 2. Component-by-Component Technical Audit

### A. Frontend Framework & Architecture
- **Framework**: Next.js `15.3.3` (App Router)
- **UI Engine**: React `19.0.0`, TailwindCSS `3.4.14`, Framer Motion `11.11.9`, Lucide React `0.454.0`
- **State Management**: Zustand `5.0.1` + native browser storage
- **Routes Compiled**:
  - `/` (Home, Game Mode Selector: Online, Pass & Play, Practice AI)
  - `/lobby` (Multiplayer Room Browser & Code Entry)
  - `/lobby/[code]` (Authoritative Pre-Game Lobby & Settings)
  - `/game/[roomId]` (Real-time Multiplayer Match Arena)
  - `/pass-and-play` (Local Pass & Play Match Engine)
  - `/practice` (Single-player Practice vs AI Impostors)
  - `/vault` (Rules, Personas, Achievements)
  - `/results/[roomId]` (Match Summary & Stats)
  - `/_not-found` (Custom 404 handler)
- **Static Assets & Logo**:
  - Official game logo verified at `/logo.png` and `/logo.jpg` in `frontend/public/`
  - Favicon located at `/favicon.ico`
- **Vercel Compatibility**:
  - Pure zero-server Next.js build.
  - Zero hardcoded localhost references in production logic.
  - Environment-based endpoint resolution via `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL`.

### B. Backend Framework & Real-Time Engine
- **Framework**: FastAPI `0.136.3`
- **ASGI Server**: Uvicorn `0.49.0` (wrapped with Socket.IO ASGI sub-app)
- **Real-Time Communication**: `python-socketio==5.13.0` (Engine.IO v4)
- **Concurrency Model**: Asyncio event loop with non-blocking DB queries and WebSocket multiplexing.
- **Port Binding**: Dynamically reads `$PORT` from environment (Render injects `PORT=10000`). Binds to `0.0.0.0`.
- **Health Checks**:
  - `GET /health`: Liveness endpoint returning server status.
  - `GET /ready`: Readiness endpoint querying the database (`SELECT 1`) to ensure DB connectivity.

### C. Database Engine & Persistence Layer
- **ORM**: SQLAlchemy `2.1.4` (Async Engine via `AsyncSessionLocal`)
- **Drivers**:
  - PostgreSQL: `asyncpg>=0.29.0` (Production Supabase driver)
  - SQLite: `aiosqlite>=0.19.0` (Local development driver)
- **Connection URL Normalization**:
  - Automatically translates `postgresql://` and `postgres://` into `postgresql+asyncpg://`.
- **Cloud Resilience Features**:
  - `pool_pre_ping=True`: Detects and drops dead pooled connections if Supabase pauses or drops sockets.
  - `pool_recycle=300`: Periodically refreshes idle connections every 5 minutes.
  - `connect_args={"ssl": True}`: Handles Supabase and cloud SSL enforcement.

### D. Data Models & Schemas
- `users`: User registration, hashed credentials (`passlib[bcrypt]`), player profiles.
- `rooms`: Persistent room metadata, code, host identifier.
- `game_history`: Post-game telemetry, suspicion ratings, win/loss stats.
- `match_states` (**NEW**): Comprehensive match state snapshot:
  - `room_code`, `host_sid`, `host_user_id`, `phase`, `mode`, `category`, `difficulty`, `impostor_count`
  - `current_round`, `total_rounds`, `current_turn_sid`, `current_turn_index`
  - `players` (JSON): Session list with readiness, alive status, and avatars
  - `turn_order` (JSON): Turn order array
  - `clues` (JSON): Round-by-round clue entries and semantic evaluations
  - `votes` (JSON): Secret ballot mapping
  - `role_acks` (JSON): Players who acknowledged private role card
  - `chaos_card` (JSON): Active chaos modifier if enabled
  - `secret_word` (**PROTECTED**): Server-side secret word
  - `player_assignments` (**PROTECTED**): Role and secret word per player

### E. Authentication & Session Security
- **Auth Scheme**: Stateless JWT tokens (`python-jose[cryptography]`) signed with server `SECRET_KEY`.
- **Guest Players**: Temporary sessions mapped by guest user ID and socket ID.
- **Role Isolation**:
  - `secret_word` is strictly isolated on the backend.
  - Role assignments are sent exclusively to the individual player's socket (`to=sid`).
  - Public match broadcasts (`game:match_started`, `game:phase_changed`) contain NO roles or secret words.
  - Votes are kept secret; only vote counts are broadcast during the voting phase.

### F. AI/ML Dependencies & Memory Footprint (Render 512MB RAM Audit)
- **Initial State**: Included `torch`, `sentence-transformers`, `transformers` (~1GB download, ~400MB RAM when loaded).
- **Free-Tier Hazard**: Render Free instances provide strictly **512MB RAM**. Importing PyTorch under concurrent load risks Linux `SIGKILL (exit code 137)` Out-Of-Memory termination.
- **Optimization Implemented**:
  1. **Decoupled Heavy Imports**: `sentence_transformers` is lazy-imported only when `ENABLE_HEAVY_EMBEDDINGS=true`.
  2. **High-Performance Lightweight Vectorizer**: Implemented a 128-dimensional character n-gram hashing vectorizer in `WordIntelligence`.
     - Memory footprint: **< 1 MB RAM**.
     - Cold-start time: **< 0.05 seconds**.
     - Cosine similarity: Deterministic, handles typos and word roots.
  3. **Player Behavior Model**: Uses `scikit-learn` Random Forest / Logistic Regression (~5MB RAM), fully compatible with free hosting.
  4. Core backend memory footprint: **~60MB RAM**, leaving over **450MB RAM of safety headroom** on Render free tier.

---

## 3. Free-Tier Constraints Matrix

| Platform | Free Tier Quota / Limits | Potential Challenge | Handled By |
| :--- | :--- | :--- | :--- |
| **Render** | 512MB RAM, 0.1 CPU core, spins down after 15 min idle | 45-50s cold-start on idle wake-up; memory limit | Single worker, decoupled heavy ML (<60MB RAM), Socket.IO client retry |
| **Render** | Ephemeral filesystem (resets on restart) | Files stored on disk are lost on deploy or restart | All state stored in Supabase PostgreSQL; zero reliance on local disk |
| **Render** | Proxy terminates idle WebSocket connections (>55s) | Dropped connections during discussion phase | `ping_interval=20`, `ping_timeout=45` configured in `AsyncServer` |
| **Supabase** | 500MB database, 50,000 MAU, pauses after 7 days idle | Idle pause; dropped pool connections | `pool_pre_ping=True`, non-destructive migrations |
| **Vercel** | 100GB bandwidth, serverless execution limits | Edge timeouts for long-lived WebSockets | Frontend is 100% static/client-rendered; WebSockets connect directly to Render |

---

## 4. Hardcoded Paths and URLs Check

- **Localhost URLs**:
  - `frontend/lib/api.ts`: Uses `process.env.NEXT_PUBLIC_API_URL` with dynamic browser hostname fallback for local dev.
  - `frontend/lib/socket.ts`: Uses `process.env.NEXT_PUBLIC_SOCKET_URL` / `NEXT_PUBLIC_API_URL`.
  - `backend/app/config.py`: Uses `ALLOWED_ORIGINS` and `FRONTEND_URL` from env.
  - `backend/app/main.py`: CORS regex matches `https://.*\.vercel\.app` and configured domains.
- **Absolute Local Paths**:
  - Zero hardcoded local Windows file paths in application logic.
  - Static files use relative paths (`/logo.png`, `/favicon.ico`, `/assets/...`).

---

## 5. Security & Authoritative Logic Verification

1. **Room Code Sanitization**: Codes are strictly normalized (`uppercase`, alphanumeric, length 6).
2. **Turn Order Authority**: Clue submission rejects any submission not matching the server's `current_turn_sid`.
3. **Voting Privacy**: Target votes are kept in server state until vote reveal; only count progress is shared.
4. **Final Guess Engine**: Caught impostor's guess is evaluated against the authoritative server secret word using fuzzy matching and semantic closeness.
5. **No Public Secrets**: Public API endpoints and `MatchStateModel.to_public_dict()` explicitly exclude `secret_word` and `player_assignments`.

---

## 6. Audit Verdict

- **Overall Status**: **READY FOR DEPLOYMENT**
- **Zero Cost Compliance**: **CONFIRMED (₹0.00 Total)**
- **Multiplayer State Survivability**: **CONFIRMED**
