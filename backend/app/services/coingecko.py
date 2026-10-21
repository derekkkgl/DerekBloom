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

TOP_N = 100  # coins on the CRYPTO board
LIST_SIZE = 200  # coins downloaded: XMOV ranks movers among these, and DES finds live prices in them
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


def fetch_markets(vs_currency: str, sparkline: bool, per_page: int = LIST_SIZE) -> list[dict]:
    return _get(
        "/coins/markets",
        {
            "vs_currency": vs_currency,
            "order": "market_cap_desc",
            "per_page": per_page,
            "page": 1,
            "sparkline": str(sparkline).lower(),
            "price_change_percentage": "1h,24h,7d",
        },
    )


def fetch_global() -> dict:
    return _get("/global")


def fetch_trending() -> dict:
    return _get("/search/trending")


def fetch_categories() -> list[dict]:
    return _get("/coins/categories", {"order": "market_cap_desc"})


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
    """Top 200 coins priced in USD and PHP. PHP prices come from CoinGecko itself, not our own FX math."""
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
    # A day's trading is normally a few percent of the market's value. CoinGecko's total has at times
    # included a coin with absurd reported volume (2026-10-21: 100,000x the whole market cap), so a
    # total above the market cap is dropped and flagged instead of shown.
    unreliable = _over(volume.get("usd"), cap.get("usd"))
    return {
        "market_cap_usd": cap.get("usd"),
        "market_cap_php": cap.get("php"),
        "volume_24h_usd": None if unreliable else volume.get("usd"),
        "volume_24h_php": None if unreliable else volume.get("php"),
        "volume_unreliable": unreliable,
        "market_cap_change_24h_pct": data.get("market_cap_change_percentage_24h_usd"),
        "btc_dominance_pct": share.get("btc"),
        "eth_dominance_pct": share.get("eth"),
        "active_coins": data.get("active_cryptocurrencies"),
    }


# --- Movers (XMOV) -------------------------------------------------------------

MOVER_WINDOWS = {"24h": "change_24h_pct", "7d": "change_7d_pct"}


def movers(coins: list[dict], window: str, n: int) -> dict:
    """The n biggest gainers and losers over a window, from the shared top-200 list (sparklines dropped).

    Coins with no change for that window are left out.
    """
    field = MOVER_WINDOWS[window]
    rows = [{k: v for k, v in c.items() if not k.startswith("sparkline")} for c in coins if c.get(field) is not None]
    moved = sorted(rows, key=lambda c: c[field], reverse=True)
    return {
        "window": window,
        "universe": len(coins),
        "gainers": [c for c in moved[:n] if c[field] > 0],
        "losers": [c for c in reversed(moved[-n:]) if c[field] < 0],
    }


# --- Trending (XMOV) -----------------------------------------------------------


def get_trending() -> list[dict]:
    return shape_trending(_wrap(fetch_trending))


def shape_trending(raw: dict) -> list[dict]:
    """CoinGecko's most-searched coins in the last 24 hours, in its order. Prices come in USD only."""
    coins = []
    for entry in raw.get("coins") or []:
        item = entry.get("item") or {}
        data = item.get("data") or {}
        change = data.get("price_change_percentage_24h") or {}
        coins.append({
            "id": item.get("id"),
            "ticker": alias_for_coin(item.get("id")),
            "symbol": (item.get("symbol") or "").upper() or None,
            "name": item.get("name"),
            "rank": item.get("market_cap_rank"),
            "price_usd": data.get("price"),
            "change_24h_pct": change.get("usd"),
            "change_24h_pct_php": change.get("php"),
            "market_cap_usd": parse_dollars(data.get("market_cap")),
        })
    if not coins:
        raise UpstreamError("CoinGecko returned no trending coins")
    return coins


def parse_dollars(text: Any) -> float | None:
    """'$20,307,092' -> 20307092.0. Trending sends market cap as display text."""
    if isinstance(text, (int, float)):
        return float(text)
    if not isinstance(text, str):
        return None
    try:
        return float(text.replace("$", "").replace(",", "").strip())
    except ValueError:
        return None


# --- Sectors (XSEC) ------------------------------------------------------------

# Sectors for the heat map, by CoinGecko category id, with a short label.
# CoinGecko has about 800 categories; many overlap or are investor portfolios ("Made in USA"),
# so the map shows a fixed list of real sectors. The table below the map lists the top 100 by size.
SECTORS: dict[str, str] = {
    "layer-1": "Layer 1",
    "layer-2": "Layer 2",
    "decentralized-finance-defi": "DeFi",
    "artificial-intelligence": "AI",
    "ai-agents": "AI agents",
    "meme-token": "Memes",
    "real-world-assets-rwa": "RWA",
    "exchange-based-tokens": "Exchange tokens",
    "decentralized-exchange": "DEX",
    "lending-borrowing": "Lending",
    "liquid-staking": "Liquid staking",
    "oracle": "Oracles",
    "privacy-coins": "Privacy",
    "depin": "DePIN",
    "gaming": "Gaming",
    "zero-knowledge-zk": "Zero knowledge",
    "infrastructure": "Infrastructure",
    "prediction-markets": "Prediction markets",
    "decentralized-perpetuals": "Perps DEX",
    "tokenized-gold": "Tokenized gold",
    "storage": "Storage",
    "payment-solutions": "Payments",
    "metaverse": "Metaverse",
}
TOP_CATEGORIES = 100


def get_categories() -> list[dict]:
    return shape_categories(_wrap(fetch_categories))


def name_top_coins(categories: list[dict], symbols: dict[str, str]) -> list[dict]:
    """Swap each category's coin ids for ticker symbols ("render-token" -> "RENDER") where we know them."""
    return [
        {
            **{k: v for k, v in c.items() if k != "top_coin_ids"},
            "top_coins": ", ".join(symbols.get(i) or i for i in c["top_coin_ids"]) or None,
        }
        for c in categories
    ]


def shape_categories(raw: list[dict]) -> list[dict]:
    """The top 100 categories by market cap, plus any map sector outside them. `sector` is the map label or null."""
    rows = [c for c in raw or [] if c.get("id") and isinstance(c.get("market_cap"), (int, float))]
    if not rows:
        raise UpstreamError("CoinGecko returned no categories")
    rows.sort(key=lambda c: c["market_cap"], reverse=True)
    kept = [(rank, c) for rank, c in enumerate(rows, start=1) if rank <= TOP_CATEGORIES or c["id"] in SECTORS]
    return [
        {
            "rank": rank,
            "id": c["id"],
            "name": c.get("name"),
            "sector": SECTORS.get(c["id"]),
            "market_cap_usd": c.get("market_cap"),
            "change_24h_pct": c.get("market_cap_change_24h"),
            "volume_24h_usd": c.get("volume_24h"),
            "top_coin_ids": [i for i in c.get("top_3_coins_id") or [] if i],
        }
        for rank, c in kept
    ]


def _over(value: Any, limit: Any) -> bool:
    return isinstance(value, (int, float)) and isinstance(limit, (int, float)) and value > limit


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
