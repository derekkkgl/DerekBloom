from datetime import datetime, timezone

from fastapi import APIRouter, Query, Response

from app.core.cache import cache
from app.core.envelope import Format, csv_response, ok
from app.core.tickers import resolve
from app.services import yahoo

router = APIRouter(prefix="/api", tags=["security"])

QUOTE_TTL = 60
INTRADAY_TTL = 60
DAILY_TTL = 600


@router.get("/quote/{ticker}")
def quote(ticker: str) -> dict:
    """Latest price and day stats. Aliases work: BTC, ETH, USDPHP."""
    t = resolve(ticker)
    result = cache.get_or_fetch(f"quote:{t.symbol}", QUOTE_TTL, lambda: yahoo.get_quote(t))
    return ok({"input": t.input, **result.value}, "yahoo", result)


@router.get("/chart/{ticker}", response_model=None)
def chart(
    ticker: str,
    range_: yahoo.Range = Query("1y", alias="range"),
    interval: yahoo.Interval = "1d",
    format: Format = "json",
) -> dict | Response:
    """OHLCV candles with SMA 20/50/200. `time` is Unix seconds."""
    t = resolve(ticker)
    yahoo.validate_chart_params(range_, interval)
    ttl = INTRADAY_TTL if interval in yahoo.INTRADAY else DAILY_TTL
    now = datetime.now(timezone.utc)
    result = cache.get_or_fetch(
        f"chart:{t.symbol}:{range_}:{interval}", ttl, lambda: yahoo.get_chart(t, range_, interval, now)
    )
    body = ok(result.value, "yahoo", result)
    if format == "csv":
        return csv_response(body["data"]["candles"], body["meta"], f"{t.symbol}_{range_}_{interval}")
    return body
