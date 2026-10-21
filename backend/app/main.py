"""FastAPI app: CORS for the frontend, error envelope, and router registration.

Run from backend/:  .venv/bin/uvicorn app.main:app --port 8000
Interactive docs:   http://localhost:8000/docs
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import ApiError
from app.db.connection import connect
from app.routers import crypto, des, markets, news, portfolio, security, system
from app.routers.system import VERSION

log = logging.getLogger("terminal")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    connect().close()  # create or migrate the database now, so a schema problem shows at startup
    yield


app = FastAPI(title="The Daily Tape API", version=VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    expose_headers=["X-Data-Source", "X-Data-As-Of", "X-Data-Stale"],
)


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(ApiError)
def handle_api_error(_: Request, exc: ApiError) -> JSONResponse:
    return _error(exc.status, exc.code, exc.message)


@app.exception_handler(RequestValidationError)
def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
    return _error(400, "bad_request", f"Invalid {field}: {first.get('msg', 'bad input')}")


@app.exception_handler(StarletteHTTPException)
def handle_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "not_found" if exc.status_code == 404 else "http_error"
    return _error(exc.status_code, code, str(exc.detail))


@app.exception_handler(Exception)
def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled error")
    return _error(500, "internal_error", f"{type(exc).__name__}: {exc}")


app.include_router(system.router)
app.include_router(markets.router)
app.include_router(security.router)
app.include_router(des.router)
app.include_router(news.router)
app.include_router(crypto.router)
app.include_router(portfolio.router)
