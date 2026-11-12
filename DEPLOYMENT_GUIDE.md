# CATCH ME IF YOU CAN? — STEP-BY-STEP ₹0 FREE CLOUD DEPLOYMENT GUIDE

This guide provides exact, step-by-step instructions to deploy **Catch Me If You Can?** to public free cloud hosting with **strictly ₹0 cost**.

---

## Architecture Overview

```
 ┌────────────────────────────────────────────────────────┐
 │                   PLAYERS' BROWSERS                    │
 │               (Desktop / Mobile / Tablet)              │
 └─────────────┬───────────────────────────┬──────────────┘
               │ HTTPS (Pages & Assets)    │ WSS (WebSockets)
               ▼                           ▼
 ┌───────────────────────────┐   ┌───────────────────────────┐
 │     VERCEL (FREE TIER)    │   │    RENDER (FREE TIER)     │
 │     Next.js 15 Frontend   │   │  FastAPI + Socket.IO      │
 │  Static & Client App      │   │  Authoritative Game Engine│
 └───────────────────────────┘   └─────────────┬─────────────┘
                                               │ asyncpg (SSL)
                                               ▼
                                 ┌───────────────────────────┐
                                 │   SUPABASE (FREE TIER)    │
                                 │   PostgreSQL Database     │
                                 │   Persistent Match State  │
                                 └───────────────────────────┘
```

---

## Phase 1: Set Up Supabase PostgreSQL Database (₹0)

Supabase provides a free cloud PostgreSQL database with 500MB storage, which is more than enough for thousands of completed games.

1. **Create Account**: Go to [supabase.com](https://supabase.com) and sign up with GitHub or Google (no credit card required).
2. **Create New Project**:
   - Organization: Select or create free organization.
   - Name: `catch-me-if-you-can`
   - Database Password: Choose a strong password and **save it in a safe place**.
   - Region: Choose a region closest to your players (e.g., `East US` or `West Europe` or `South Asia`).
   - Pricing Plan: **Free ($0/month)**.
   - Click **Create new project** (takes ~1-2 minutes to provision).
3. **Get Connection String**:
   - Go to **Project Settings** (gear icon at the bottom left) -> **Database**.
   - Scroll down to **Connection string**.
   - Select the **URI** tab.
   - Select **Connection pooling** (recommended for serverless/cloud) or **Direct connection**:
     - *Pooler URI (Port 6543)*:
       ```
       postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
       ```
   - Replace `[YOUR-PASSWORD]` with your actual database password.
4. **Verify Database Connection & Run Initial Migration**:
   - On your local computer, open a terminal in the project root:
     ```bash
     cd backend
     python -c "import secrets; print(secrets.token_hex(32))"
     ```
   - Test connectivity and apply table schema with:
     ```bash
     DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@...pooler.supabase.com:6543/postgres" python scripts/migrate_db.py
     ```
   - You should see:
     ```
     ✅ Connection successful! Roundtrip latency: ...ms
     ✅ Base schema and 'match_states' table synchronized.
     🎉 Database migration completed successfully with 0 errors!
     ```

---

## Phase 2: Deploy FastAPI Backend on Render (₹0)

Render provides a free Web Service tier with 512MB RAM, automatic HTTPS, and native WebSocket support.

### Option A: Using Render Blueprint (Fastest — 1 Click)
1. Push your repository to GitHub.
2. In [render.com](https://render.com), click **New +** -> **Blueprint**.
3. Select your repository. Render will automatically detect `render.yaml`.
4. Fill in the environment variables:
   - `DATABASE_URL`: Your Supabase connection string.
   - `FRONTEND_URL`: Leave blank initially, or put your Vercel URL.
5. Click **Apply**.

---

### Option B: Manual Web Service Setup
1. Log in to [render.com](https://render.com) (sign up with GitHub).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository containing the project.
4. Configure the service settings:
   - **Name**: `catch-me-if-you-can-backend`
   - **Region**: Same region as your Supabase database.
   - **Branch**: `main` (or your active branch)
   - **Root Directory**: `backend` (or leave empty if using root commands)
   - **Runtime**: `Python 3`
   - **Build Command**:
     ```bash
     pip install -r requirements.txt && python scripts/migrate_db.py
     ```
   - **Start Command**:
     ```bash
     uvicorn app.main:socket_app --host 0.0.0.0 --port $PORT --workers 1
     ```
   - **Instance Type**: **Free (0.1 CPU, 512 MB RAM)**
5. Expand **Advanced** -> **Add Environment Variables**:
   | Key | Recommended Value | Notes |
   | :--- | :--- | :--- |
   | `PYTHON_VERSION` | `3.12.2` | Recommended Python version |
   | `APP_ENV` | `production` | Enables production mode & hides docs |
   | `SECRET_KEY` | *(Generate 32-char hex)* | Run: `python -c "import secrets; print(secrets.token_hex(32))"` |
   | `DATABASE_URL` | `postgresql://...` | Your Supabase connection string |
   | `ENABLE_HEAVY_EMBEDDINGS` | `false` | **Critical for 512MB RAM!** Uses lightweight zero-RAM vectorizer |
   | `FRONTEND_URL` | `https://your-frontend.vercel.app` | Updated after Phase 3 |
   | `ALLOWED_ORIGINS` | `http://localhost:3000,https://your-frontend.vercel.app` | Comma-separated |
6. Set **Health Check Path**: `/health`
7. Click **Create Web Service**.
8. Wait for build and deployment to complete (~2 minutes).
9. Copy your backend public URL:
   - Example: `https://catch-me-if-you-can-backend.onrender.com`
10. Test health endpoints in your browser:
    - Open `https://catch-me-if-you-can-backend.onrender.com/health` -> `{"status":"healthy","env":"production","version":"0.1.0"}`
    - Open `https://catch-me-if-you-can-backend.onrender.com/ready` -> `{"status":"ready","database":"connected",...}`

---

## Phase 3: Deploy Next.js Frontend on Vercel (₹0)

Vercel provides free global CDN hosting with automatic SSL for Next.js applications.

1. Log in to [vercel.com](https://vercel.com) with GitHub.
2. Click **Add New...** -> **Project**.
3. Import your GitHub repository.
4. In the **Configure Project** screen:
   - **Project Name**: `catch-me-if-you-can`
   - **Framework Preset**: `Next.js`
   - **Root Directory**: Click **Edit** and select `frontend`.
5. Expand **Environment Variables**:
   Add the following variables (pointing to your Render backend URL):
   | Key | Value |
   | :--- | :--- |
   | `NEXT_PUBLIC_API_URL` | `https://catch-me-if-you-can-backend.onrender.com` |
   | `NEXT_PUBLIC_SOCKET_URL` | `https://catch-me-if-you-can-backend.onrender.com` |
6. Click **Deploy**.
7. In ~60 seconds, your site is live!
8. Copy your production frontend URL:
   - Example: `https://catch-me-if-you-can.vercel.app`

---

## Phase 4: Connect & Finalize CORS

1. Go back to [render.com](https://render.com) -> your backend Web Service -> **Environment**.
2. Update `FRONTEND_URL` and `ALLOWED_ORIGINS`:
   - `FRONTEND_URL`: `https://catch-me-if-you-can.vercel.app`
   - `ALLOWED_ORIGINS`: `http://localhost:3000,https://catch-me-if-you-can.vercel.app`
3. Click **Save Changes**. Render will automatically redeploy with the updated CORS settings.

---

## Phase 5: Verification & Quality Checklist

Test the live application end-to-end:

1. **Home Page & Logo**:
   - Navigate to `https://catch-me-if-you-can.vercel.app`.
   - Verify official logo, crisp fonts, character badge graphics, and dark theme.
2. **Local Modes**:
   - Test **Practice vs AI**: Start a match, verify AI bots submit contextual clues and take voting turns.
   - Test **Pass & Play**: Run a 3-player pass-and-play match, verify privacy screens and role reveal.
3. **Real Online Multiplayer**:
   - Open `https://catch-me-if-you-can.vercel.app` on Device 1 (or Incognito window).
   - Click **Online Multiplayer** -> **Create Room**.
   - Copy the 6-character room code (e.g. `ABC123`).
   - Open Device 2 (e.g. mobile phone), enter the room code, and click **Join Room**.
   - Verify:
     - Player cards appear in real time on both screens.
     - Toggle Ready status; verify synchronization.
     - Host starts the match.
     - Each player sees their private role card (Secret Word for civilians, "IMPOSTOR" for impostor).
     - Clues can be typed and submitted in turn order.
     - Discussion phase and secret voting work smoothly.
     - Winner celebration screen displays final stats.
4. **Backend Restart & Recovery Test**:
   - While a match is in progress, go to Render dashboard and click **Manual Deploy** -> **Restart Service**.
   - In the browser, notice the WebSocket temporarily reconnects.
   - Within seconds of Render returning online, refresh or click sync:
   - **The exact match phase, round, turn order, clues, and private roles are completely restored from Supabase PostgreSQL!**
   - Zero game corruption, zero leaked secret words.

---

## Understanding Free-Tier Behavior

1. **Render 15-Minute Inactivity Sleep**:
   - If no one visits your game for 15 minutes, Render puts the backend web service to sleep to conserve resources.
   - The first request after sleep (cold start) takes **~45 seconds** to spin up.
   - Once awake, response times are instantaneous (<50ms).
   - *Tip*: Free third-party cron monitors (e.g. [cron-job.org](https://cron-job.org) or UptimeRobot) can ping `https://your-backend.onrender.com/health` every 10 minutes to keep it permanently awake for ₹0!
2. **Supabase 7-Day Inactivity Pause**:
   - If a Supabase free database receives no queries for 7 consecutive days, Supabase pauses it.
   - Visiting your game or running a match automatically wakes it up.
3. **Render 512MB RAM Optimization**:
   - By keeping `ENABLE_HEAVY_EMBEDDINGS=false`, memory usage stays at **~60MB**, ensuring your free service never crashes or runs out of memory.
