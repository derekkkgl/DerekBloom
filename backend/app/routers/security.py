from datetime import date, datetime, timezone

from fastapi import APIRouter, Query, Response

from app.core.cache import cache
from app.core.envelope import Format, csv_response, ok
from app.core.errors import BadRequest
from app.core.tickers import Ticker, resolve
from app.services import yahoo

router = APIRouter(prefix="/api", tags=["security"])

QUOTE_TTL = 60
INTRADAY_TTL = 60
DAILY_TTL = 600
MAX_QUOTES = 25


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
    currency: yahoo.Currency = "native",
    format: Format = "json",
) -> dict | Response:
    """OHLCV candles with SMA 20/50/200. `time` and `close_time` are Unix seconds.

    `currency=PHP` converts USD prices bar by bar at the USD/PHP rate of each bar's own time.
    """
    t = resolve(ticker)
    yahoo.validate_chart_params(range_, interval)
    ttl = INTRADAY_TTL if interval in yahoo.INTRADAY else DAILY_TTL
    now = datetime.now(timezone.utc)
    result = cache.get_or_fetch(
        f"chart:{t.symbol}:{range_}:{interval}:{currency}",
        ttl,
        lambda: yahoo.get_chart(t, range_, interval, now, currency),
    )
    body = ok(result.value, "yahoo", result)
    if format == "csv":
        suffix = "_PHP" if body["data"]["converted"] else ""
        return csv_response(body["data"]["candles"], body["meta"], f"{t.symbol}_{range_}_{interval}{suffix}")
    return body


def parse_symbols(raw: str) -> list[Ticker]:
    """'AAPL, nvda,BTC' -> resolved tickers, in order, without repeats of the same Yahoo symbol."""
    tickers: dict[str, Ticker] = {}
    for part in raw.split(","):
        if part.strip():
            t = resolve(part)
            tickers.setdefault(t.symbol, t)
    if not tickers:
        raise BadRequest("Give at least one symbol, e.g. ?symbols=AAPL,NVDA")
    if len(tickers) > MAX_QUOTES:
        raise BadRequest(f"Too many symbols ({len(tickers)}). The limit is {MAX_QUOTES} per request.")
    return list(tickers.values())


@router.get("/quotes", response_model=None)
def quotes(
    symbols: str = Query(..., description="Comma-separated tickers, e.g. AAPL,NVDA,VOO"),
    format: Format = "json",
) -> dict | Response:
    """Last close, day change, and about a month of daily closes for many tickers, in one batch download."""
    tickers = parse_symbols(symbols)
    wanted = sorted(t.symbol for t in tickers)
    result = cache.get_or_fetch(
        "quotes:" + ",".join(wanted), QUOTE_TTL, lambda: yahoo.get_quotes(wanted, date.today())
    )
    rows = [{"input": t.input, "symbol": t.symbol, **result.value[t.symbol]} for t in tickers]
    body = ok({"quotes": rows}, "yahoo", result)
    if format == "csv":
        flat = [{k: v for k, v in row.items() if k != "closes"} for row in body["data"]["quotes"]]
        return csv_response(flat, body["meta"], "quotes")
    return body
