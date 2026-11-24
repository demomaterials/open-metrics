import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import get_settings
from .db import engine
from .routers import auth, boards, datasources, metrics

logging.basicConfig(level=get_settings().log_level.upper(), format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="open-metrics", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    # CSRF defence in depth on top of SameSite=Strict cookies: state-changing
    # API calls must carry a header that cross-site forms cannot set.
    if (
        request.url.path.startswith("/api/")
        and request.method not in SAFE_METHODS
        and request.headers.get("x-requested-with") != "open-metrics"
    ):
        return JSONResponse({"detail": "Missing X-Requested-With header"}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.get("/healthz", include_in_schema=False)
def healthz():
    return {"status": "ok"}


@app.get("/readyz", include_in_schema=False)
def readyz():
    try:
        with engine().connect() as conn:
            conn.execute(text("SELECT 1 FROM alembic_version"))
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"status": "unavailable", "error": type(e).__name__}, status_code=503)
    return {"status": "ready"}


for r in (auth.router, boards.router, metrics.router, datasources.router):
    app.include_router(r)
