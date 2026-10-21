"""Crypto Fear & Greed Index from alternative.me (free, no key).

The index is one number from 0 (extreme fear) to 100 (extreme greed), published once a day.
alternative.me asks that the data be credited next to where it is shown; XGLB's panel names it.
The API can take several seconds to answer, so the router caches it for an hour.
"""

from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any, TypeVar

import requests

from app.core.errors import ApiError, UpstreamError

URL = "https://api.alternative.me/fng/"
USER_AGENT = "DailyTape/0.1"
TIMEOUT_SECONDS = 30
MAX_DAYS = 365
T = TypeVar("T")


def fetch_index(days: int) -> dict:
    res = requests.get(
        URL,
        params={"limit": days, "format": "json"},
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=TIMEOUT_SECONDS,
    )
    res.raise_for_status()
    return res.json()


def _wrap(fn: Callable[[], T]) -> T:
    try:
        return fn()
    except ApiError:
        raise
    except Exception as exc:
        raise UpstreamError(f"alternative.me request failed: {type(exc).__name__}: {exc}") from exc


def get_index() -> dict:
    """Today's reading and a year of daily history. The router trims the history to what was asked."""
    return shape_index(_wrap(lambda: fetch_index(MAX_DAYS)))


def shape_index(raw: dict) -> dict:
    """Newest first from the API; we return history oldest first (what a chart wants)."""
    error = (raw.get("metadata") or {}).get("error")
    if error:
        raise UpstreamError(f"alternative.me returned an error: {error}")
    points = []
    for row in raw.get("data") or []:
        value, stamp = _int(row.get("value")), _int(row.get("timestamp"))
        if value is None or stamp is None:
            continue
        points.append({
            "date": datetime.fromtimestamp(stamp, tz=timezone.utc).date().isoformat(),
            "value": value,
            "label": row.get("value_classification"),
        })
    if not points:
        raise UpstreamError("alternative.me returned no Fear & Greed readings")
    points.sort(key=lambda p: p["date"])
    latest = points[-1]

    def ago(days: int) -> int | None:
        return points[-1 - days]["value"] if len(points) > days else None

    return {
        "value": latest["value"],
        "label": latest["label"],
        "date": latest["date"],
        "yesterday": ago(1),
        "week_ago": ago(7),
        "month_ago": ago(30),
        "history": points,
    }


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
