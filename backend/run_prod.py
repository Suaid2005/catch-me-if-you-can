"""
run_prod.py
───────────
Reliable production starter for Catch Me If You Can? FastAPI backend.
Binds to 0.0.0.0 and dynamically reads PORT from environment variables.
"""
import os
import sys
import uvicorn
from app.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    port = int(os.environ.get("PORT", getattr(settings, "port", 8000)))
    host = os.environ.get("HOST", "0.0.0.0")

    print(f"🚀 Launching production server on http://{host}:{port}")
    uvicorn.run(
        "app.main:socket_app",
        host=host,
        port=port,
        workers=1,
        log_level="info",
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
