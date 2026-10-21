"""DefiLlama open API (free, no key): DeFi value locked and stablecoin supply.

TVL (total value locked) is the dollar value of the coins people have deposited into
DeFi apps: lending pools, exchanges, staking. All values are in USD.

The full protocol list is about 9 MB, so the router caches every DefiLlama answer for an hour
and only the top rows are kept in memory.
"""

from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any, TypeVar

import requests

from app.core.errors import ApiError, UpstreamError

API_URL = "https://api.llama.fi"
STABLES_URL = "https://stablecoins.llama.fi"
USER_AGENT = "DailyTape/0.1"
TIMEOUT_SECONDS = 30
T = TypeVar("T")

TOP_CHAINS = 20
TOP_PROTOCOLS = 25
# Exchanges report their reserves to DefiLlama too, but money held by an exchange isn't DeFi.
NOT_DEFI = {"CEX"}
DAY = 86_400


def _get(url: str) -> Any:
    res = requests.get(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}, timeout=TIMEOUT_SECONDS)
    if res.status_code == 429:
        raise UpstreamError("DefiLlama rate limit reached (HTTP 429). Try again in a minute.")
    res.raise_for_status()
    return res.json()


def fetch_chains() -> list[dict]:
    return _get(f"{API_URL}/v2/chains")


def fetch_protocols() -> list[dict]:
    return _get(f"{API_URL}/protocols")


def fetch_tvl_history() -> list[dict]:
    return _get(f"{API_URL}/v2/historicalChainTvl")


def fetch_stablecoin_history() -> list[dict]:
    return _get(f"{STABLES_URL}/stablecoincharts/all")


def _wrap(fn: Callable[[], T]) -> T:
    try:
        return fn()
    except ApiError:
        raise
    except Exception as exc:
        raise UpstreamError(f"DefiLlama request failed: {type(exc).__name__}: {exc}") from exc


def _num(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _pct(now: float | None, then: float | None) -> float | None:
    return (now / then - 1) * 100 if now is not None and then else None


def _day(stamp: Any) -> str | None:
    try:
        return datetime.fromtimestamp(int(stamp), tz=timezone.utc).date().isoformat()
    except (TypeError, ValueError):
        return None


# --- Chains ------------------------------------------------------------------


def get_chains() -> list[dict]:
    return shape_chains(_wrap(fetch_chains))


def shape_chains(raw: list[dict]) -> list[dict]:
    """Top chains by TVL, with each chain's share of the total across all chains."""
    chains = [c for c in raw or [] if _num(c.get("tvl"))]
    if not chains:
        raise UpstreamError("DefiLlama returned no chains")
    total = sum(_num(c.get("tvl")) or 0 for c in chains)
    chains.sort(key=lambda c: c["tvl"], reverse=True)
    return [
        {
            "rank": i,
            "name": c.get("name"),
            "token": c.get("tokenSymbol"),
            "tvl_usd": _num(c.get("tvl")),
            "share_pct": (_num(c.get("tvl")) or 0) / total * 100,
        }
        for i, c in enumerate(chains[:TOP_CHAINS], start=1)
    ]


# --- Protocols ---------------------------------------------------------------


def get_protocols() -> list[dict]:
    return shape_protocols(_wrap(fetch_protocols))


def shape_protocols(raw: list[dict]) -> list[dict]:
    """Top DeFi apps by TVL, exchanges left out."""
    protocols = [p for p in raw or [] if p.get("category") not in NOT_DEFI and _num(p.get("tvl"))]
    if not protocols:
        raise UpstreamError("DefiLlama returned no protocols")
    protocols.sort(key=lambda p: p["tvl"], reverse=True)
    return [
        {
            "rank": i,
            "name": p.get("name"),
            "symbol": p.get("symbol") if p.get("symbol") not in (None, "-") else None,
            "category": p.get("category"),
            "chain": p.get("chain"),
            "chain_count": len(p.get("chains") or []),
            "tvl_usd": _num(p.get("tvl")),
            "change_1d_pct": _num(p.get("change_1d")),
            "change_7d_pct": _num(p.get("change_7d")),
        }
        for i, p in enumerate(protocols[:TOP_PROTOCOLS], start=1)
    ]


# --- Total TVL over time -----------------------------------------------------


def get_tvl() -> dict:
    return shape_tvl(_wrap(fetch_tvl_history))


def shape_tvl(raw: list[dict]) -> dict:
    """Total DeFi TVL today, its 1d/7d/30d change, and the daily history (oldest first)."""
    points = [(int(p["date"]), _num(p.get("tvl"))) for p in raw or [] if p.get("date") is not None]
    points = sorted((t, v) for t, v in points if v)  # zeros are days before DeFi existed
    if not points:
        raise UpstreamError("DefiLlama returned no TVL history")
    last_time, last = points[-1]
    return {
        "tvl_usd": last,
        "date": _day(last_time),
        "change_1d_pct": _pct(last, value_on_or_before(points, last_time - DAY)),
        "change_7d_pct": _pct(last, value_on_or_before(points, last_time - 7 * DAY)),
        "change_30d_pct": _pct(last, value_on_or_before(points, last_time - 30 * DAY)),
        "history": [{"date": _day(t), "value": v} for t, v in points],
    }


def value_on_or_before(points: list[tuple[int, float]], when: int) -> float | None:
    """The last value at or before a Unix time, from points sorted oldest first."""
    found = None
    for t, v in points:
        if t > when:
            break
        found = v
    return found


# --- Stablecoins -------------------------------------------------------------


def get_stablecoins() -> dict:
    return shape_stablecoins(_wrap(fetch_stablecoin_history))


def shape_stablecoins(raw: list[dict]) -> dict:
    """Total stablecoin supply in USD (every peg, valued in dollars) and its 7d/30d change."""
    points = []
    for row in raw or []:
        pegs = row.get("totalCirculatingUSD") or {}
        total = sum(v for v in (_num(x) for x in pegs.values()) if v)
        if row.get("date") is not None and total:
            points.append((int(row["date"]), total))
    points.sort()
    if not points:
        raise UpstreamError("DefiLlama returned no stablecoin supply")
    last_time, last = points[-1]
    return {
        "supply_usd": last,
        "date": _day(last_time),
        "change_7d_pct": _pct(last, value_on_or_before(points, last_time - 7 * DAY)),
        "change_30d_pct": _pct(last, value_on_or_before(points, last_time - 30 * DAY)),
    }
