"""
KosmoInsight AI — FastAPI application entry point.
v2: Rate limiting, WebSocket real-time updates, API versioning, audit logging.
"""
from dotenv import load_dotenv
load_dotenv()

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.database import engine, Base
from app.middleware.rate_limit import limiter
from app.api import (
    auth, customers, payments, products,
    health, analytics, predictions, uploads,
    reports, installments, notifications, audit,
)

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Startup / Shutdown ──────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(" KosmoInsight AI backend starting up …")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info(" Database tables ready.")
    except Exception as exc:
        # Don't let a DB hiccup at boot prevent the port from opening —
        # that's what produces Render's opaque "No open ports detected"
        # timeout. Log it loudly instead so /api/health is still reachable
        # for debugging, and DB-backed endpoints will retry per-request.
        logger.error(f" Database not reachable at startup: {exc}")
        logger.error(" Check DATABASE_URL in your environment variables.")
    yield
    logger.info(" KosmoInsight AI shutting down.")

# ─── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="KosmoInsight AI API",
    description=(
        "PayGo + Credit + Payment Tracking SaaS for East Africa. "
        "Includes AI risk scoring, real-time analytics, and mobile money abstraction."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── Rate Limiting ───────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── CORS ────────────────────────────────────────────────────────────────────
# Always-allowed origins (hardcoded as safety net)
DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://kosmoinsight.vercel.app",
]

# Merge with any extra origins from env var
extra = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "").split(",")
    if o.strip()
]

CORS_ORIGINS = list(set(DEFAULT_ORIGINS + extra))
logger.info(f"CORS allowed origins: {CORS_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)

# ─── API v1 routers ──────────────────────────────────────────────────────────
PREFIX = "/api/v1"

app.include_router(auth.router,          prefix=f"{PREFIX}/auth",           tags=["Authentication"])
app.include_router(customers.router,     prefix=f"{PREFIX}/customers",       tags=["Customers"])
app.include_router(payments.router,      prefix=f"{PREFIX}/payments",        tags=["Payments"])
app.include_router(installments.router,  prefix=f"{PREFIX}/installments",    tags=["Installments"])
app.include_router(products.router,      prefix=f"{PREFIX}/products",        tags=["Products"])
app.include_router(health.router,        prefix=f"{PREFIX}/health-sessions", tags=["Health Sessions"])
app.include_router(analytics.router,     prefix=f"{PREFIX}/analytics",       tags=["Analytics"])
app.include_router(predictions.router,   prefix=f"{PREFIX}/predict",         tags=["AI Predictions"])
app.include_router(uploads.router,       prefix=f"{PREFIX}/uploads",         tags=["Data Upload"])
app.include_router(reports.router,       prefix=f"{PREFIX}/reports",         tags=["Reports"])
app.include_router(notifications.router, prefix=f"{PREFIX}/notifications",   tags=["Notifications"])
app.include_router(audit.router,         prefix=f"{PREFIX}/audit",           tags=["Audit Logs"])

# ─── Backward-compat aliases ──────────────────────────────────────────────────
app.include_router(auth.router,        prefix="/api/auth",      tags=["Auth (legacy)"],        include_in_schema=False)
app.include_router(customers.router,   prefix="/api/customers", tags=["Customers (legacy)"],   include_in_schema=False)
app.include_router(payments.router,    prefix="/api/payments",  tags=["Payments (legacy)"],    include_in_schema=False)
app.include_router(analytics.router,   prefix="/api/analytics", tags=["Analytics (legacy)"],   include_in_schema=False)
app.include_router(predictions.router, prefix="/api/predict",   tags=["Predictions (legacy)"], include_in_schema=False)
app.include_router(reports.router,     prefix="/api/reports",   tags=["Reports (legacy)"],     include_in_schema=False)

# ─── Health check ─────────────────────────────────────────────────────────────
@app.get("/", tags=["Root"])
def root():
    return {
        "message": "KosmoInsight AI API is running",
        "version": "2.0.0",
        "docs":    "/docs",
    }

@app.get("/api/health", tags=["Root"])
def health_check():
    return {"status": "ok", "version": "2.0.0"}

# ─── WebSocket — real-time dashboard updates ──────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, message: dict):
        import json
        for ws in list(self.active):
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                self.active.remove(ws)


ws_manager = ConnectionManager()


@app.websocket("/ws/dashboard")
async def dashboard_ws(websocket: WebSocket):
    await ws_manager.connect(websocket)
    import asyncio
    try:
        while True:
            await asyncio.sleep(30)
            await websocket.send_text('{"type":"ping","status":"ok"}')
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
