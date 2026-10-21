import time

from fastapi import APIRouter

from app.core.cache import CacheResult, cache
from app.core.envelope import ok

VERSION = "0.1.0"

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
def health() -> dict:
    """Server is alive. Never calls the internet."""
    data = {"status": "ok", "version": VERSION, "cache_entries": len(cache)}
    return ok(data, "local", CacheResult(data, time.time(), cached=False, stale=False))
