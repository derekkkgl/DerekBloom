"""CoinGecko public API (no key).

The keyless tier has a tight rate limit, so the router caches results for 2 minutes
and the cache serves the last good copy if CoinGecko throttles us.
"""

from typing import Any

import requests

from app.core.errors import ApiError, UpstreamError

BASE_URL = "https://api.coingecko.com/api/v3"
USER_AGENT = "DailyTape/0.1"
TIMEOUT_SECONDS = 15
TOP_N = 100


def fetch_markets(vs_currency: str, sparkline: bool) -> list[dict]:
    res = requests.get(
        f"{BASE_URL}/coins/markets",
        params={
            "vs_currency": vs_currency,
            "order": "market_cap_desc",
            "per_page": TOP_N,
            "page": 1,
            "sparkline": str(sparkline).lower(),
            "price_change_percentage": "1h,24h,7d",
        },
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=TIMEOUT_SECONDS,
    )
    if res.status_code == 429:
        raise UpstreamError("CoinGecko rate limit reached (HTTP 429). Try again in a minute.")
    res.raise_for_status()
    return res.json()


def get_markets() -> list[dict]:
    """Top coins priced in USD and PHP. PHP prices come from CoinGecko itself, not our own FX math."""
    try:
        usd = fetch_markets("usd", sparkline=True)
        php = fetch_markets("php", sparkline=False)
    except ApiError:
        raise
    except Exception as exc:
        raise UpstreamError(f"CoinGecko request failed: {type(exc).__name__}: {exc}") from exc
    return shape_markets(usd, php)


def shape_markets(usd: list[dict], php: list[dict]) -> list[dict]:
    if not usd:
        raise UpstreamError("CoinGecko returned no coins")
    php_by_id = {coin.get("id"): coin for coin in php}
    coins = []
    for coin in usd:
        in_php: dict[str, Any] = php_by_id.get(coin.get("id"), {})
        coins.append(
            {
                "id": coin.get("id"),
                "symbol": (coin.get("symbol") or "").upper() or None,
                "name": coin.get("name"),
                "rank": coin.get("market_cap_rank"),
                "price_usd": coin.get("current_price"),
                "price_php": in_php.get("current_price"),
                "change_1h_pct": coin.get("price_change_percentage_1h_in_currency"),
                "change_24h_pct": coin.get("price_change_percentage_24h_in_currency"),
                "change_7d_pct": coin.get("price_change_percentage_7d_in_currency"),
                "volume_usd": coin.get("total_volume"),
                "market_cap_usd": coin.get("market_cap"),
                "market_cap_php": in_php.get("market_cap"),
                "sparkline_7d": (coin.get("sparkline_in_7d") or {}).get("price") or [],
            }
        )
    return coins
