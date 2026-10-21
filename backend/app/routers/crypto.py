from fastapi import APIRouter, Response

from app.core.cache import cache
from app.core.envelope import Format, csv_response, ok
from app.services import coingecko

router = APIRouter(prefix="/api/crypto", tags=["crypto"])

MARKETS_TTL = 120
GLOBAL_TTL = 300


@router.get("/markets", response_model=None)
def markets(format: Format = "json") -> dict | Response:
    """Top 100 coins by market cap, priced in USD and PHP, with a 7-day sparkline."""
    result = cache.get_or_fetch("crypto:markets", MARKETS_TTL, coingecko.get_markets)
    body = ok({"coins": result.value}, "coingecko", result)
    if format == "csv":
        rows = [{k: v for k, v in coin.items() if k != "sparkline_7d"} for coin in body["data"]["coins"]]
        return csv_response(rows, body["meta"], "crypto_markets")
    return body


@router.get("/global")
def global_market() -> dict:
    """Total crypto market cap and volume (USD and PHP), plus BTC and ETH dominance."""
    result = cache.get_or_fetch("crypto:global", GLOBAL_TTL, coingecko.get_global)
    return ok(result.value, "coingecko", result)
