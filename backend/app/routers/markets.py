from datetime import datetime, timezone

from fastapi import APIRouter, Response

from app.core.cache import cache
from app.core.envelope import Format, csv_response, ok
from app.core.markets import REGIONS, WEI_ROWS, market_status
from app.services import yahoo

router = APIRouter(prefix="/api", tags=["markets"])

WEI_TTL = 60


@router.get("/wei", response_model=None)
def wei(format: Format = "json") -> dict | Response:
    """World equity indices plus cross-asset rows, grouped by region."""
    now = datetime.now(timezone.utc)
    result = cache.get_or_fetch("wei", WEI_TTL, lambda: yahoo.get_wei(now))

    # Status is computed per request, so it flips at the open/close even when prices are cached.
    rows = [
        {
            "symbol": row.symbol,
            "name": row.name,
            "region": row.region,
            "currency": row.currency,
            **result.value[row.symbol],
            "status": market_status(row.market, now),
        }
        for row in WEI_ROWS
    ]
    groups = [{"region": region, "rows": [r for r in rows if r["region"] == region]} for region in REGIONS]
    body = ok({"groups": groups}, "yahoo", result)
    if format == "csv":
        return csv_response([r for g in body["data"]["groups"] for r in g["rows"]], body["meta"], "wei")
    return body
