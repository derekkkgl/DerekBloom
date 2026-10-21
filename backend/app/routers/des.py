from fastapi import APIRouter

from app.core.cache import CacheResult, cache
from app.core.clean import clean
from app.core.envelope import build_meta, ok
from app.core.errors import ApiError
from app.core.tickers import Ticker, resolve
from app.routers.crypto import load_markets
from app.services import coingecko, yahoo

router = APIRouter(prefix="/api", tags=["security"])

PROFILE_TTL = 6 * 3600


@router.get("/des/{ticker}")
def des(ticker: str) -> dict:
    """Profile and key stats. Stocks and ETFs come from Yahoo; coins (BTC, ETH ...) from CoinGecko."""
    t = resolve(ticker)
    if t.coingecko_id:
        return _coin(t, t.coingecko_id)
    result = cache.get_or_fetch(f"des:{t.symbol}", PROFILE_TTL, lambda: yahoo.get_des(t))
    return ok({"kind": "security", "input": t.input, **result.value}, "yahoo", result)


def _coin(t: Ticker, coin_id: str) -> dict:
    profile = cache.get_or_fetch(f"coin:{coin_id}", PROFILE_TTL, lambda: coingecko.get_coin(coin_id))

    # The live price comes from the cached market list. If that list is down, the profile's own
    # (older) price is used, and the meta time says how old it is.
    markets: CacheResult | None
    try:
        markets = load_markets()
    except ApiError:
        markets = None
    live = next((c for c in markets.value if c.get("id") == coin_id), None) if markets else None

    used = [profile, markets] if live and markets else [profile]
    meta = build_meta(
        "coingecko",
        fetched_at=min(r.fetched_at for r in used),
        cached=all(r.cached for r in used),
        stale=any(r.stale for r in used),
    )
    data = coingecko.coin_des(profile.value, live)
    return clean({"data": {"kind": "coin", "input": t.input, **data}, "meta": meta})
