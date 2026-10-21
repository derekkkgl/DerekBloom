from datetime import date

from fastapi import APIRouter, Query, Response

from app.core.cache import CacheResult, cache
from app.core.envelope import Format, csv_response, ok
from app.core.errors import ApiError
from app.services import coingecko, defillama, feargreed, yahoo

router = APIRouter(prefix="/api/crypto", tags=["crypto"])

MARKETS_TTL = 120
GLOBAL_TTL = 300
MOVERS_TTL = 300
TRENDING_TTL = 600
SECTORS_TTL = 600
FEAR_GREED_TTL = 3600  # the index is published once a day
STABLECOINS_TTL = 3600
USD_PHP_TTL = 300


def load_markets() -> CacheResult:
    """The top-100 list. Shared by CRYPTO, Home, and coin DES so they cost one CoinGecko call between them."""
    return cache.get_or_fetch("crypto:markets", MARKETS_TTL, coingecko.get_markets)


def usd_php_rate() -> float | None:
    """Yahoo's USD/PHP, for USD totals that have no peso version from their source (the same rate PORT uses).

    None when Yahoo is down: the peso fields then come back null instead of failing the whole screen.
    """
    try:
        return cache.get_or_fetch("fx:usd_php", USD_PHP_TTL, lambda: yahoo.get_usd_php(date.today())).value
    except ApiError:
        return None


def with_php(rows: list[dict], fields: tuple[str, ...], rate: float | None) -> list[dict]:
    """Add a `<name>_php` next to each `<name>_usd` field, converted at `rate`."""
    def php(value: float | None) -> float | None:
        return value * rate if value is not None and rate is not None else None

    return [{**row, **{f.removesuffix("_usd") + "_php": php(row.get(f)) for f in fields}} for row in rows]


@router.get("/markets", response_model=None)
def markets(format: Format = "json") -> dict | Response:
    """Top 100 coins by market cap, priced in USD and PHP, with 7-day sparklines in both."""
    result = load_markets()
    body = ok({"coins": result.value}, "coingecko", result)
    if format == "csv":
        rows = [{k: v for k, v in coin.items() if not k.startswith("sparkline")} for coin in body["data"]["coins"]]
        return csv_response(rows, body["meta"], "crypto_markets")
    return body


@router.get("/global")
def global_market() -> dict:
    """Total crypto market cap and volume (USD and PHP), plus BTC and ETH dominance."""
    result = cache.get_or_fetch("crypto:global", GLOBAL_TTL, coingecko.get_global)
    return ok(result.value, "coingecko", result)


@router.get("/fear-greed")
def fear_greed(days: int = Query(365, ge=2, le=feargreed.MAX_DAYS)) -> dict:
    """Crypto Fear & Greed Index (0 = extreme fear, 100 = extreme greed): today and daily history."""
    result = cache.get_or_fetch("crypto:fear-greed", FEAR_GREED_TTL, feargreed.get_index)
    data = {**result.value, "history": result.value["history"][-days:]}
    return ok(data, "alternative.me", result)


@router.get("/stablecoins")
def stablecoins() -> dict:
    """Total stablecoin supply in USD and its 7-day and 30-day change."""
    result = cache.get_or_fetch("crypto:stablecoins", STABLECOINS_TTL, defillama.get_stablecoins)
    rate = usd_php_rate()
    data = {**with_php([result.value], ("supply_usd",), rate)[0], "usd_php": rate}
    return ok(data, "defillama", result)


@router.get("/movers", response_model=None)
def movers(
    window: str = Query("24h", pattern="^(24h|7d)$"),
    n: int = Query(10, ge=1, le=50),
    format: Format = "json",
) -> dict | Response:
    """Biggest gainers and losers among the top 200 coins over 24 hours or 7 days."""
    result = cache.get_or_fetch("crypto:top200", MOVERS_TTL, coingecko.get_top200)
    body = ok(coingecko.movers(result.value, window, n), "coingecko", result)
    if format == "csv":
        d = body["data"]
        rows = [{"side": "gainer", **c} for c in d["gainers"]] + [{"side": "loser", **c} for c in d["losers"]]
        return csv_response(rows, body["meta"], f"crypto_movers_{window}")
    return body


@router.get("/trending")
def trending() -> dict:
    """CoinGecko's most-searched coins in the last 24 hours. Peso prices use Yahoo's USD/PHP."""
    result = cache.get_or_fetch("crypto:trending", TRENDING_TTL, coingecko.get_trending)
    rate = usd_php_rate()
    coins = with_php(result.value, ("price_usd", "market_cap_usd"), rate)
    return ok({"coins": coins, "usd_php": rate}, "coingecko", result)


@router.get("/sectors", response_model=None)
def sectors(format: Format = "json") -> dict | Response:
    """Crypto categories by market cap with their 24-hour change. `sector` marks the ones on the heat map."""
    result = cache.get_or_fetch("crypto:sectors", SECTORS_TTL, coingecko.get_categories)
    rate = usd_php_rate()
    rows = with_php(result.value, ("market_cap_usd", "volume_24h_usd"), rate)
    body = ok({"categories": rows, "usd_php": rate}, "coingecko", result)
    if format == "csv":
        return csv_response(body["data"]["categories"], body["meta"], "crypto_sectors")
    return body
