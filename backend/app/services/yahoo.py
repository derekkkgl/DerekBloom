"""Yahoo Finance via yfinance.

fetch_* functions only talk to Yahoo and contain no logic.
shape_* functions are pure: they turn raw yfinance output into our JSON shapes.
Tests replace the fetchers with small fake DataFrames and run the shapers for real.
"""

import math
import threading
from collections.abc import Callable
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal, TypeVar

import pandas as pd
import yfinance as yf
from yfinance.exceptions import YFRateLimitError

from app.core.errors import ApiError, BadRequest, NotFound, UpstreamError
from app.core.markets import WEI_ROWS
from app.core.tickers import Ticker

T = TypeVar("T")

Range = Literal["1d", "5d", "1mo", "3mo", "6mo", "ytd", "1y", "2y", "5y", "10y", "max"]
Interval = Literal["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"]

INTRADAY = {"1m", "5m", "15m", "30m", "1h"}

# Which ranges Yahoo can serve for each bar size (1m: ~7 days back, other intraday: ~60 days, 1h: ~730 days).
ALLOWED_RANGES: dict[str, list[str]] = {
    "1m": ["1d", "5d"],
    "5m": ["1d", "5d", "1mo"],
    "15m": ["1d", "5d", "1mo"],
    "30m": ["1d", "5d", "1mo"],
    "1h": ["1d", "5d", "1mo", "3mo", "6mo", "ytd", "1y"],
    "1d": ["5d", "1mo", "3mo", "6mo", "ytd", "1y", "2y", "5y", "10y", "max"],
    "1wk": ["3mo", "6mo", "ytd", "1y", "2y", "5y", "10y", "max"],
    "1mo": ["1y", "2y", "5y", "10y", "max"],
}

RANGE_OFFSETS: dict[str, pd.DateOffset] = {
    "5d": pd.DateOffset(days=7),  # about 5 trading days
    "1mo": pd.DateOffset(months=1),
    "3mo": pd.DateOffset(months=3),
    "6mo": pd.DateOffset(months=6),
    "1y": pd.DateOffset(years=1),
    "2y": pd.DateOffset(years=2),
    "5y": pd.DateOffset(years=5),
    "10y": pd.DateOffset(years=10),
}

# Extra calendar days fetched before the visible range so SMA 200 is filled from the first candle.
WARMUP_DAYS = {"1d": 320, "1wk": 1450, "1mo": 6200}

SMA_WINDOWS = (20, 50, 200)

# yf.download shares global state between calls, so batch downloads run one at a time.
_download_lock = threading.Lock()


# --- Fetchers (network only) -------------------------------------------------


def fetch_info(symbol: str) -> dict:
    return yf.Ticker(symbol).info


def fetch_history(symbol: str, interval: str, period: str | None = None, start: date | None = None) -> tuple[pd.DataFrame, dict]:
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, start=start, interval=interval, auto_adjust=False)
    return df, ticker.get_history_metadata() or {}


def fetch_download(symbols: list[str], start: date) -> pd.DataFrame:
    with _download_lock:
        return yf.download(
            symbols, start=start, interval="1d", group_by="column", auto_adjust=False, progress=False, threads=True
        )


def _call(fn: Callable[[], T]) -> T:
    """Run a fetcher and turn any library or network failure into a 502."""
    try:
        return fn()
    except ApiError:
        raise
    except YFRateLimitError as exc:
        raise UpstreamError("Yahoo Finance rate limit reached. Try again in a minute.") from exc
    except Exception as exc:
        raise UpstreamError(f"Yahoo Finance request failed: {type(exc).__name__}: {exc}") from exc


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _pct(last: float | None, base: float | None) -> float | None:
    if last is None or not base:
        return None
    return (last / base - 1) * 100


# --- Quote -------------------------------------------------------------------


def get_quote(ticker: Ticker) -> dict:
    return shape_quote(ticker, _call(lambda: fetch_info(ticker.symbol)))


def shape_quote(ticker: Ticker, info: dict) -> dict:
    price = _num(info.get("regularMarketPrice")) or _num(info.get("currentPrice"))
    name = info.get("shortName") or info.get("longName")
    if price is None and name is None:
        raise NotFound(f"No data for ticker {ticker.input}")

    prev_close = _num(info.get("regularMarketPreviousClose")) or _num(info.get("previousClose"))
    market_time = _num(info.get("regularMarketTime"))
    return {
        "symbol": ticker.symbol,
        "name": name,
        "type": info.get("quoteType"),
        "currency": info.get("currency"),
        "exchange": info.get("fullExchangeName") or info.get("exchange"),
        "price": price,
        "prev_close": prev_close,
        "change": price - prev_close if price is not None and prev_close is not None else None,
        "change_pct": _pct(price, prev_close),
        "open": _num(info.get("regularMarketOpen")),
        "day_high": _num(info.get("regularMarketDayHigh")),
        "day_low": _num(info.get("regularMarketDayLow")),
        "volume": _num(info.get("regularMarketVolume")),
        "year_high": _num(info.get("fiftyTwoWeekHigh")),
        "year_low": _num(info.get("fiftyTwoWeekLow")),
        "market_cap": _num(info.get("marketCap")),
        "market_time": datetime.fromtimestamp(market_time, tz=timezone.utc) if market_time else None,
    }


# --- Chart -------------------------------------------------------------------


def validate_chart_params(rng: str, interval: str) -> None:
    allowed = ALLOWED_RANGES[interval]
    if rng not in allowed:
        raise BadRequest(f"Interval {interval} supports ranges: {', '.join(allowed)} (got {rng}).")


def range_start(rng: str, now: datetime) -> pd.Timestamp:
    if rng == "ytd":
        return pd.Timestamp(now.year, 1, 1, tz="UTC")
    return pd.Timestamp(now).tz_convert("UTC") - RANGE_OFFSETS[rng]


def get_chart(ticker: Ticker, rng: str, interval: str, now: datetime) -> dict:
    validate_chart_params(rng, interval)
    if interval in INTRADAY or rng == "max":
        visible_start = None
        df, meta = _call(lambda: fetch_history(ticker.symbol, interval, period=rng))
    else:
        visible_start = range_start(rng, now)
        fetch_from = (visible_start - timedelta(days=WARMUP_DAYS[interval])).date()
        df, meta = _call(lambda: fetch_history(ticker.symbol, interval, start=fetch_from))
    return shape_chart(ticker, rng, interval, df, meta.get("currency"), visible_start)


def shape_chart(
    ticker: Ticker,
    rng: str,
    interval: str,
    df: pd.DataFrame | None,
    currency: str | None,
    visible_start: pd.Timestamp | None,
) -> dict:
    if df is None or df.empty or "Close" not in df.columns:
        raise NotFound(f"No chart data for {ticker.input}")

    df = df.dropna(subset=["Close"])
    index = df.index if df.index.tz is not None else df.index.tz_localize("UTC")
    close = df["Close"]
    bars = pd.DataFrame(
        {
            "open": df["Open"].to_numpy(),
            "high": df["High"].to_numpy(),
            "low": df["Low"].to_numpy(),
            "close": close.to_numpy(),
            "volume": df["Volume"].to_numpy() if "Volume" in df.columns else None,
            **{f"sma{n}": close.rolling(n).mean().to_numpy() for n in SMA_WINDOWS},
        },
        index=index,
    )
    if visible_start is not None:
        bars = bars[bars.index >= visible_start]

    candles = [{"time": int(ts.timestamp()), **row} for ts, row in zip(bars.index, bars.to_dict("records"))]
    return {"symbol": ticker.symbol, "currency": currency, "range": rng, "interval": interval, "candles": candles}


# --- WEI ---------------------------------------------------------------------


def get_wei(now: datetime) -> dict[str, dict]:
    start = date(now.year - 1, 12, 1)  # enough history to find last year's final close
    df = _call(lambda: fetch_download([row.symbol for row in WEI_ROWS], start))
    return shape_wei(df, now.year)


def shape_wei(df: pd.DataFrame | None, year: int) -> dict[str, dict]:
    """Per-symbol last, change, YTD. Symbols with no data get null values, not an error."""
    if df is None or df.empty or "Close" not in df.columns.get_level_values(0):
        raise UpstreamError("Yahoo returned no data for the WEI board")
    closes = df["Close"]
    return {row.symbol: _wei_values(closes.get(row.symbol), year) for row in WEI_ROWS}


def _wei_values(series: pd.Series | None, year: int) -> dict:
    empty = {"last": None, "change": None, "change_pct": None, "ytd_pct": None, "last_date": None}
    if series is None:
        return empty
    series = series.dropna()
    if series.empty:
        return empty

    last = float(series.iloc[-1])
    prev = float(series.iloc[-2]) if len(series) > 1 else None
    year_start = pd.Timestamp(year, 1, 1)
    if series.index.tz is not None:
        year_start = year_start.tz_localize(series.index.tz)
    before_year = series[series.index < year_start]
    ytd_base = float(before_year.iloc[-1]) if not before_year.empty else None

    return {
        "last": last,
        "change": last - prev if prev is not None else None,
        "change_pct": _pct(last, prev),
        "ytd_pct": _pct(last, ytd_base),
        "last_date": series.index[-1].date().isoformat(),
    }
