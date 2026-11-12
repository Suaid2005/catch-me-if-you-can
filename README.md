# 🕵️ Catch Me If You Can?

> **"Think alike. Speak wisely. Catch the one who doesn't!"**

A modern, real-time multiplayer social-deduction party game with semantic word intelligence, AI bot players, and ML suspicion analysis.

---

## 🎮 Three Ways to Play

1. 🌐 **Online Multiplayer**: Real-time room-code party play across phones, tablets, and computers with authoritative server synchronization.
2. 📱 **Local Pass & Play**: Single-screen party mode for 3–12 players around a table with privacy guard screens.
3. 🤖 **Practice vs AI**: Solo mode against diverse AI personas (analytical, deceptive, chaotic) with dynamic difficulty.

---

## 🏗️ Architecture & Cloud Stack (Strictly ₹0 / Month)

- **Frontend**: Next.js 15.3.3 (App Router, Tailwind CSS, Framer Motion, Zustand) hosted on **Vercel** (Hobby Free Tier).
- **Backend**: FastAPI 0.136.3 + Python-SocketIO 5.13.0 hosted on **Render** (Free Web Service Tier).
- **Database**: PostgreSQL 15+ hosted on **Supabase** (Free Tier PostgreSQL with asyncpg).
- **AI/ML Engine**: Scikit-learn behavior modeling + zero-RAM character n-gram cosine similarity vectorizer.

---

## 🚀 Free Cloud Deployment

For the complete, step-by-step deployment guide for Vercel, Render, and Supabase, refer to:
- 📖 [DEPLOYMENT_GUIDE.md](file:///c:/Users/ASUS/Catch-Me-If-You-Can/DEPLOYMENT_GUIDE.md)
- 📋 [DEPLOYMENT_AUDIT.md](file:///c:/Users/ASUS/Catch-Me-If-You-Can/DEPLOYMENT_AUDIT.md)

### Deployment Quick Links
- **Vercel Configuration**: `vercel.json` (root) & `frontend/vercel.json`
- **Render Blueprint**: `render.yaml` (root) & `backend/render.yaml`
- **Database Migration**: `backend/scripts/migrate_db.py`
- **Environment Reference**: `.env.example`, `backend/.env.example`, `frontend/.env.example`

---

## 💻 Local Development Setup

### 1. Prerequisites
- Python 3.11+
- Node.js 18+

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
python scripts/migrate_db.py
uvicorn app.main:socket_app --reload --host 127.0.0.1 --port 8000
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to play!

---

## 🧪 Running Automated Tests

```bash
# Run backend game engine, game modes, and persistence tests:
pytest backend/tests/test_engine_and_modes.py -v
pytest backend/tests/test_persistence_and_recovery.py -v

# Run database migration verification:
python backend/scripts/migrate_db.py

# Run frontend production build:
cd frontend && npm run build
```

---

## 🛡️ License
MIT
