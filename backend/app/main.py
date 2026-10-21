"""FastAPI app: CORS for the frontend, error envelope, and router registration.

Run from backend/:  .venv/bin/uvicorn app.main:app --port 8000
Interactive docs:   http://localhost:8000/docs
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import ApiError
from app.routers import system
from app.routers.system import VERSION

log = logging.getLogger("terminal")

app = FastAPI(title="Swiss Glass Terminal API", version=VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET"],
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
