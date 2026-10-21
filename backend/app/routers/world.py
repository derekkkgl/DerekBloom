"""World markets: US screeners, currencies, commodities, the ETF heat map, and the world map. All from Yahoo."""

from typing import Literal

from fastapi import APIRouter, Response

from app.core.cache import cache
from app.core.envelope import Format, csv_response, ok
from app.routers.crypto import usd_php_rate, with_php
from app.services import world

router = APIRouter(prefix="/api", tags=["world"])

SCREEN_TTL = 120

ScreenName = Literal["most-active", "gainers", "losers"]


@router.get("/screen/{name}", response_model=None)
def screen(name: ScreenName, format: Format = "json") -> dict | Response:
    """US most active stocks, top gainers, or top losers today (Yahoo's predefined screeners, 25 rows)."""
    result = cache.get_or_fetch(f"screen:{name}", SCREEN_TTL, lambda: world.get_screen(name))
    rate = usd_php_rate()
    rows = with_php(result.value["rows"], ("price_usd", "change_usd", "market_cap_usd"), rate)
    body = ok({"screen": name, "total": result.value["total"], "rows": rows, "usd_php": rate}, "yahoo", result)
    if format == "csv":
        return csv_response(body["data"]["rows"], body["meta"], f"screen_{name}")
    return body
