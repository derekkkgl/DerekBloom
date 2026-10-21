from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from fastapi import APIRouter, Query, Response

from app.core.cache import CacheResult, cache
from app.core.clean import clean
from app.core.envelope import Format, build_meta, csv_response
from app.core.errors import ApiError, UpstreamError
from app.services import rss

router = APIRouter(prefix="/api", tags=["news"])

FEED_TTL = 300


def _load(feed: rss.Feed) -> CacheResult | ApiError:
    try:
        return cache.get_or_fetch(f"news:{feed.name}", FEED_TTL, lambda: rss.get_feed(feed))
    except ApiError as exc:
        return exc


@router.get("/news", response_model=None)
def news(
    category: Literal["all", "markets", "crypto"] = "all",
    limit: int = Query(50, ge=1, le=200),
    format: Format = "json",
) -> dict | Response:
    """Headlines from public RSS feeds, deduplicated, newest first. One dead feed doesn't break the rest."""
    feeds = [f for f in rss.FEEDS if category in ("all", f.category)]
    with ThreadPoolExecutor(max_workers=len(feeds)) as pool:
        outcomes = list(pool.map(_load, feeds))

    sources = []
    loaded: list[CacheResult] = []
    for feed, outcome in zip(feeds, outcomes):
        if isinstance(outcome, ApiError):
            sources.append({"name": feed.name, "ok": False, "count": 0, "stale": False, "error": outcome.message})
        else:
            loaded.append(outcome)
            sources.append({"name": feed.name, "ok": True, "count": len(outcome.value), "stale": outcome.stale, "error": None})

    if not loaded:
        raise UpstreamError("All news feeds failed: " + "; ".join(s["error"] for s in sources))

    items = rss.merge_items([r.value for r in loaded], limit)
    meta = build_meta(
        "rss",
        fetched_at=min(r.fetched_at for r in loaded),  # oldest feed in the mix
        cached=all(r.cached for r in loaded),
        stale=any(r.stale for r in loaded),
    )
    body = clean({"data": {"items": items, "sources": sources}, "meta": meta})
    if format == "csv":
        return csv_response(body["data"]["items"], body["meta"], f"news_{category}")
    return body
