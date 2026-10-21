"""World markets: US screeners, currencies, commodities, the ETF heat map, and the world map. All from Yahoo."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Response

from app.core.cache import cache
from app.core.envelope import Format, csv_response, ok
from app.routers.crypto import usd_php_rate, with_php
from app.services import world

router = APIRouter(prefix="/api", tags=["world"])

SCREEN_TTL = 120
FX_TTL = 60
COMMODITIES_TTL = 60

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


@router.get("/fx", response_model=None)
def fx(format: Format = "json") -> dict | Response:
    """Major currencies against the dollar and the peso, the US dollar index, and a cross-rate matrix."""
    result = cache.get_or_fetch("fx", FX_TTL, lambda: world.get_fx(date.today()))
    body = ok(result.value, "yahoo", result)
    if format == "csv":
        rows = [{k: v for k, v in row.items() if k != "closes_php"} for row in body["data"]["rows"]]
        return csv_response(rows, body["meta"], "fx")
    return body


@router.get("/commodities", response_model=None)
def commodities(format: Format = "json") -> dict | Response:
    """Gold, silver, crude, natural gas, copper, and wheat futures in dollars, with peso prices at Yahoo's USD/PHP."""
    result = cache.get_or_fetch("commodities", COMMODITIES_TTL, lambda: world.get_commodities(date.today()))
    rate = usd_php_rate()
    rows = with_php(result.value["rows"], ("last_usd", "change_usd"), rate)
    body = ok({"rows": rows, "usd_php": rate}, "yahoo", result)
    if format == "csv":
        return csv_response([{k: v for k, v in r.items() if k != "closes"} for r in body["data"]["rows"]], body["meta"], "commodities")
    return body
