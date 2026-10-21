"""World markets: US screeners, currencies, commodities, the ETF heat map, and the world map. All from Yahoo."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Literal

from fastapi import APIRouter, Query, Response

from app.core.cache import cache
from app.core.envelope import Format, csv_response, ok
from app.core.errors import ApiError
from app.core.world import SECTOR_ETFS, WORLD_ETFS
from app.routers.crypto import usd_php_rate, with_php
from app.routers.security import parse_symbols
from app.services import world, yahoo

router = APIRouter(prefix="/api", tags=["world"])

SCREEN_TTL = 120
FX_TTL = 60
COMMODITIES_TTL = 60
IMAP_MOVES_TTL = 60
SIZE_TTL = 86_400  # sector weights and fund sizes barely move in a day
WMAP_TTL = 60

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


def fund_size(symbol: str) -> dict:
    """A fund's assets or a company's market cap, cached a day. Empty when Yahoo has none, so one gap can't sink the map."""
    try:
        return cache.get_or_fetch(f"size:{symbol}", SIZE_TTL, lambda: world.get_size(symbol)).value
    except ApiError:
        return {"name": None, "size_usd": None}


def sector_weights() -> dict[str, float]:
    try:
        return cache.get_or_fetch("imap:sector-weights", SIZE_TTL, world.get_sector_weights).value
    except ApiError:
        return {}


@router.get("/imap", response_model=None)
def imap(
    symbols: str = Query("", description="Your list for the third map, e.g. AAPL,NVDA,VOO"),
    format: Format = "json",
) -> dict | Response:
    """Three heat maps: US sector ETFs sized by S&P 500 weight, world ETFs by fund assets, and your list by size.

    Day moves come from one batch download; weights and sizes are cached for a day.
    """
    home = parse_symbols(symbols) if symbols.strip() else []
    sized = list(dict.fromkeys([f.symbol for f in WORLD_ETFS] + [t.symbol for t in home]))
    everything = sorted(set(sized) | {f.symbol for f in SECTOR_ETFS})
    result = cache.get_or_fetch(
        "imap:moves:" + ",".join(everything), IMAP_MOVES_TTL, lambda: yahoo.get_quotes(everything, date.today())
    )

    def move(symbol: str) -> dict:
        quote = result.value[symbol]
        return {"change_pct": quote["change_pct"], "last_date": quote["last_date"]}

    weights = sector_weights()
    # Up to a dozen profile lookups at about half a second each: run them side by side.
    with ThreadPoolExecutor(max_workers=8) as pool:
        sizes = dict(zip(sized, pool.map(fund_size, sized)))
    rate = usd_php_rate()

    groups = [
        {
            "id": "sectors",
            "title": "US sectors",
            "rows": [
                {"symbol": f.symbol, "name": f.name, "weight_pct": weights.get(f.sector_key or ""), **move(f.symbol)}
                for f in SECTOR_ETFS
            ],
        },
        {
            "id": "world",
            "title": "World ETFs",
            "rows": with_php(
                [{"symbol": f.symbol, "name": f.name, "size_usd": sizes[f.symbol]["size_usd"], **move(f.symbol)} for f in WORLD_ETFS],
                ("size_usd",),
                rate,
            ),
        },
        {
            "id": "home",
            "title": "Your Home list",
            "rows": with_php(
                [
                    {"input": t.input, "symbol": t.symbol, "name": sizes[t.symbol]["name"], "size_usd": sizes[t.symbol]["size_usd"], **move(t.symbol)}
                    for t in home
                ],
                ("size_usd",),
                rate,
            ),
        },
    ]
    body = ok({"groups": groups, "usd_php": rate}, "yahoo", result)
    if format == "csv":
        rows = [{"group": g["id"], **row} for g in body["data"]["groups"] for row in g["rows"]]
        return csv_response(rows, body["meta"], "imap")
    return body


@router.get("/wmap", response_model=None)
def wmap(format: Format = "json") -> dict | Response:
    """About two dozen national stock indices, each with its square on the world tile map."""
    result = cache.get_or_fetch("wmap", WMAP_TTL, lambda: world.get_wmap(date.today()))
    body = ok(result.value, "yahoo", result)
    if format == "csv":
        return csv_response(body["data"]["markets"], body["meta"], "wmap")
    return body
