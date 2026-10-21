"""CoinGecko public API (no key).

The keyless tier has a tight rate limit, so the routers cache hard (2 minutes for the
market list, 6 hours for coin profiles) and the cache serves the last good copy if
CoinGecko throttles us.
"""

import re
from collections.abc import Callable
from typing import Any, TypeVar

import requests

from app.core.clean import strip_html
from app.core.errors import ApiError, UpstreamError
from app.core.tickers import alias_for_coin

BASE_URL = "https://api.coingecko.com/api/v3"
USER_AGENT = "DailyTape/0.1"
TIMEOUT_SECONDS = 15
T = TypeVar("T")

TOP_N = 100
SUMMARY_CHARS = 800
MAX_CATEGORIES = 3


def _get(path: str, params: dict | None = None) -> Any:
    res = requests.get(
        f"{BASE_URL}{path}",
        params=params,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=TIMEOUT_SECONDS,
    )
    if res.status_code == 429:
        raise UpstreamError("CoinGecko rate limit reached (HTTP 429). Try again in a minute.")
    res.raise_for_status()
    return res.json()


def fetch_markets(vs_currency: str, sparkline: bool) -> list[dict]:
    return _get(
        "/coins/markets",
        {
            "vs_currency": vs_currency,
            "order": "market_cap_desc",
            "per_page": TOP_N,
            "page": 1,
            "sparkline": str(sparkline).lower(),
            "price_change_percentage": "1h,24h,7d",
        },
    )


def fetch_global() -> dict:
    return _get("/global")


def fetch_coin(coin_id: str) -> dict:
    return _get(
        f"/coins/{coin_id}",
        {
            "localization": "false",
            "tickers": "false",
            "market_data": "true",
            "community_data": "false",
            "developer_data": "false",
            "sparkline": "false",
        },
    )


def _wrap(fn: Callable[[], T]) -> T:
    """Run a fetcher and turn any network failure into a 502 with the reason."""
    try:
        return fn()
    except ApiError:
        raise
    except Exception as exc:
        raise UpstreamError(f"CoinGecko request failed: {type(exc).__name__}: {exc}") from exc


def get_markets() -> list[dict]:
    """Top coins priced in USD and PHP. PHP prices come from CoinGecko itself, not our own FX math."""
    usd = _wrap(lambda: fetch_markets("usd", sparkline=True))
    php = _wrap(lambda: fetch_markets("php", sparkline=True))
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
                "ticker": alias_for_coin(coin.get("id")),  # what to type in Look up, when an alias exists
                "symbol": (coin.get("symbol") or "").upper() or None,
                "name": coin.get("name"),
                "rank": coin.get("market_cap_rank"),
                "price_usd": coin.get("current_price"),
                "price_php": in_php.get("current_price"),
                "change_1h_pct": coin.get("price_change_percentage_1h_in_currency"),
                "change_24h_pct": coin.get("price_change_percentage_24h_in_currency"),
                "change_7d_pct": coin.get("price_change_percentage_7d_in_currency"),
                # Changes measured in pesos (the coin's move plus the peso's), straight from CoinGecko.
                "change_1h_pct_php": in_php.get("price_change_percentage_1h_in_currency"),
                "change_24h_pct_php": in_php.get("price_change_percentage_24h_in_currency"),
                "change_7d_pct_php": in_php.get("price_change_percentage_7d_in_currency"),
                "volume_usd": coin.get("total_volume"),
                "volume_php": in_php.get("total_volume"),
                "market_cap_usd": coin.get("market_cap"),
                "market_cap_php": in_php.get("market_cap"),
                "sparkline_7d": _sparkline(coin),
                "sparkline_7d_php": _sparkline(in_php),
            }
        )
    return coins


def _sparkline(coin: dict) -> list[float]:
    return (coin.get("sparkline_in_7d") or {}).get("price") or []


def get_global() -> dict:
    """Whole crypto market: total cap, volume, and BTC / ETH dominance."""
    return shape_global(_wrap(fetch_global))


def shape_global(raw: dict) -> dict:
    data = raw.get("data")
    if not data:
        raise UpstreamError("CoinGecko returned no global market data")
    cap = data.get("total_market_cap") or {}
    volume = data.get("total_volume") or {}
    share = data.get("market_cap_percentage") or {}
    return {
        "market_cap_usd": cap.get("usd"),
        "market_cap_php": cap.get("php"),
        "volume_24h_usd": volume.get("usd"),
        "volume_24h_php": volume.get("php"),
        "market_cap_change_24h_pct": data.get("market_cap_change_percentage_24h_usd"),
        "btc_dominance_pct": share.get("btc"),
        "eth_dominance_pct": share.get("eth"),
        "active_coins": data.get("active_cryptocurrencies"),
    }


# --- Coin profile (DES) ------------------------------------------------------


def get_coin(coin_id: str) -> dict:
    return shape_coin(_wrap(lambda: fetch_coin(coin_id)))


def shape_coin(raw: dict) -> dict:
    """The slow-changing part of a coin's profile: description, links, supply, all-time high."""
    if not raw.get("id"):
        raise UpstreamError("CoinGecko returned no coin profile")
    md = raw.get("market_data") or {}
    links = raw.get("links") or {}

    def pair(field: str) -> dict:
        return md.get(field) or {}

    return {
        "id": raw.get("id"),
        "symbol": (raw.get("symbol") or "").upper() or None,
        "name": raw.get("name"),
        "rank": raw.get("market_cap_rank"),
        "categories": [c for c in raw.get("categories") or [] if c][:MAX_CATEGORIES],
        "summary": first_paragraph((raw.get("description") or {}).get("en")),
        "genesis_date": raw.get("genesis_date"),
        "links": {
            "homepage": _first(links.get("homepage")),
            "whitepaper": links.get("whitepaper") or None,
            "explorer": _first(links.get("blockchain_site")),
            "source": _first((links.get("repos_url") or {}).get("github")),
        },
        "circulating_supply": md.get("circulating_supply"),
        "total_supply": md.get("total_supply"),
        "max_supply": md.get("max_supply"),
        "fdv_usd": pair("fully_diluted_valuation").get("usd"),
        "fdv_php": pair("fully_diluted_valuation").get("php"),
        "ath_usd": pair("ath").get("usd"),
        "ath_php": pair("ath").get("php"),
        "ath_date_usd": pair("ath_date").get("usd"),
        "ath_date_php": pair("ath_date").get("php"),
        # Price as of the profile fetch. Only used when the live market list doesn't include this coin.
        "price_usd": pair("current_price").get("usd"),
        "price_php": pair("current_price").get("php"),
        "change_24h_pct": md.get("price_change_percentage_24h"),
        "change_24h_pct_php": pair("price_change_percentage_24h_in_currency").get("php"),
        "volume_usd": pair("total_volume").get("usd"),
        "volume_php": pair("total_volume").get("php"),
        "market_cap_usd": pair("market_cap").get("usd"),
        "market_cap_php": pair("market_cap").get("php"),
    }


LIVE_FIELDS = (
    "price_usd", "price_php", "change_24h_pct", "change_24h_pct_php",
    "volume_usd", "volume_php", "market_cap_usd", "market_cap_php",
)


def coin_des(profile: dict, live: dict | None) -> dict:
    """Join the 6-hour profile with the 2-minute market row, then measure the distance from the all-time high."""
    data = {**profile, **({k: live.get(k) for k in LIVE_FIELDS} if live else {})}
    for cur in ("usd", "php"):
        price, ath = data[f"price_{cur}"], data[f"ath_{cur}"]
        if price is not None and ath is not None and price > ath:
            # A new high since the profile was fetched: the live price is the high now.
            data[f"ath_{cur}"], data[f"ath_date_{cur}"] = price, None
            ath = price
        data[f"from_ath_pct_{cur}"] = (price / ath - 1) * 100 if price is not None and ath else None
    return data


def first_paragraph(description: str | None) -> str | None:
    """First paragraph as plain text, cut at a word boundary if it runs long."""
    if not description:
        return None
    for para in re.split(r"(?:\r?\n){2,}", description):
        text = strip_html(para)
        if text:
            if len(text) <= SUMMARY_CHARS:
                return text
            return text[:SUMMARY_CHARS].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return None


def _first(values: list | None) -> str | None:
    return next((v for v in values or [] if v), None)
