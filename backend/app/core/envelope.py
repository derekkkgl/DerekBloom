"""Build the standard response: {"data": ..., "meta": {...}} as JSON, or a flat CSV table."""

from datetime import datetime, timezone
from typing import Any, Literal

import pandas as pd
from fastapi import Response

from app.core.cache import CacheResult
from app.core.clean import clean, to_iso

Format = Literal["json", "csv"]


def build_meta(source: str, fetched_at: float, cached: bool, stale: bool) -> dict:
    return {
        "source": source,
        "as_of": to_iso(datetime.fromtimestamp(fetched_at, tz=timezone.utc)),
        "cached": cached,
        "stale": stale,
    }


def ok(data: Any, source: str, result: CacheResult) -> dict:
    return clean({"data": data, "meta": build_meta(source, result.fetched_at, result.cached, result.stale)})


def csv_response(rows: list[dict], meta: dict, filename: str) -> Response:
    """Flat table for Excel Power Query. Meta travels in X-Data-* headers."""
    text = pd.DataFrame(clean(rows)).to_csv(index=False)
    return Response(
        content=text,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'inline; filename="{filename}.csv"',
            "X-Data-Source": meta["source"],
            "X-Data-As-Of": meta["as_of"],
            "X-Data-Stale": str(meta["stale"]).lower(),
        },
    )
