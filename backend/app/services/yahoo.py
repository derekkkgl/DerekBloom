"""Yahoo Finance via yfinance.

fetch_* functions only talk to Yahoo and contain no logic.
shape_* functions are pure: they turn raw yfinance output into our JSON shapes.
Tests replace the fetchers with small fake DataFrames and run the shapers for real.
"""

import math
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Literal, TypeVar

import pandas as pd
import yfinance as yf
from yfinance.exceptions import YFRateLimitError

from app.core.errors import ApiError, BadRequest, NotFound, UpstreamError
from app.core.markets import WEI_ROWS
from app.core.tickers import TICKER_RE, Ticker, alias_name

T = TypeVar("T")

Currency = Literal["native", "PHP"]
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

# Charts in pesos convert every bar at the USD/PHP rate of its own time, never today's rate.
FX_SYMBOL = "PHP=X"
NOT_CONVERTIBLE = {
    "INDEX": "This is an index measured in points, not a price, so it stays as is.",
    "CURRENCY": "This is an exchange rate, so it stays as is.",
}
# Intraday FX bars are fetched over a longer window, so 24/7 coins still have a rate for their first bars.
FX_INTRADAY_PERIOD = {"1d": "5d", "5d": "1mo"}

QUOTES_HISTORY_DAYS = 45  # about 30 trading days: enough for the previous close and a 1-month sparkline
SPARK_POINTS = 22  # about one month of daily closes

FUND_TYPES = {"ETF", "MUTUALFUND"}

# yf.download shares global state between calls, so batch downloads run one at a time.
_download_lock = threading.Lock()


# --- Fetchers (network only) -------------------------------------------------


def fetch_info(symbol: str) -> dict:
    return yf.Ticker(symbol).info


def fetch_history(symbol: str, interval: str, period: str | None = None, start: date | None = None) -> tuple[pd.DataFrame, dict]:
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, start=start, interval=interval, auto_adjust=False)
    return df, ticker.get_history_metadata() or {}


def fetch_search(query: str) -> list[dict]:
    """Yahoo's ticker search, the same one behind the search box on finance.yahoo.com."""
    return yf.Search(query, max_results=10, news_count=0, lists_count=0).quotes


def fetch_download(symbols: list[str], start: date, actions: bool = False) -> pd.DataFrame:
    """Daily bars for many symbols in one request. actions=True adds Dividends and Stock Splits columns."""
    with _download_lock:
        return yf.download(
            symbols,
            start=start,
            interval="1d",
            group_by="column",
            auto_adjust=False,
            actions=actions,
            progress=False,
            threads=True,
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


def get_chart(ticker: Ticker, rng: str, interval: str, now: datetime, currency: Currency = "native") -> dict:
    validate_chart_params(rng, interval)
    if interval in INTRADAY or rng == "max":
        visible_start = None
        fetch = lambda symbol, period=rng: fetch_history(symbol, interval, period=period)  # noqa: E731
        df, meta = _call(lambda: fetch(ticker.symbol))
    else:
        visible_start = range_start(rng, now)
        fetch_from = (visible_start - timedelta(days=WARMUP_DAYS[interval])).date()
        fetch = lambda symbol, period=None: fetch_history(symbol, interval, start=fetch_from)  # noqa: E731
        df, meta = _call(lambda: fetch(ticker.symbol))

    conversion = None
    if currency == "PHP" and df is not None and not df.empty:
        blocker = php_blocker(meta)
        if blocker:
            conversion = {"converted": False, "note": blocker}
        else:
            try:
                fx, _ = _call(lambda: fetch(FX_SYMBOL, FX_INTRADAY_PERIOD.get(rng, rng)))
                df, note = convert_to_php(df, fx, interval in INTRADAY)
                conversion = {"converted": True, "note": note}
            except (ApiError, ValueError) as exc:
                reason = exc.message if isinstance(exc, ApiError) else str(exc)
                conversion = {"converted": False, "note": f"USD/PHP history isn't available right now ({reason}), so prices stay in USD."}

    return shape_chart(ticker, rng, interval, df, meta.get("currency"), visible_start, meta=meta, conversion=conversion)


def php_blocker(meta: dict) -> str | None:
    """Why this chart can't be shown in pesos, or None if it can."""
    kind = meta.get("instrumentType")
    if kind in NOT_CONVERTIBLE:
        return NOT_CONVERTIBLE[kind]
    native = meta.get("currency")
    if native != "USD":
        return f"Prices are in {native or 'an unknown currency'}; only USD prices convert to PHP so far."
    return None


def _bar_keys(index: pd.DatetimeIndex, intraday: bool) -> pd.DatetimeIndex:
    """Match bars by exact time intraday, and by trading date for daily and longer bars.

    Daily bars are stamped at local midnight of their exchange, so rounding to the nearest
    UTC midnight gives the same date for a New York bar and the matching London FX bar.
    """
    utc = index.tz_convert("UTC") if index.tz is not None else index.tz_localize("UTC")
    return utc if intraday else (utc + pd.Timedelta(hours=12)).floor("D")


def convert_to_php(df: pd.DataFrame, fx: pd.DataFrame | None, intraday: bool) -> tuple[pd.DataFrame, str]:
    """Multiply each bar's prices by the USD/PHP close of the same bar (or the last one before it).

    Volume stays in shares or coins. Bars older than the FX history are dropped, not guessed.
    """
    rates = fx["Close"].dropna() if fx is not None and "Close" in fx.columns else pd.Series(dtype=float)
    if rates.empty:
        raise ValueError("Yahoo returned no USD/PHP bars")

    left = pd.DataFrame({"key": _bar_keys(df.index, intraday), "row": range(len(df))})
    right = pd.DataFrame({"key": _bar_keys(rates.index, intraday), "rate": rates.to_numpy()})
    right = right.drop_duplicates("key", keep="last").sort_values("key")
    matched = pd.merge_asof(left.sort_values("key"), right, on="key", direction="backward").sort_values("row")
    rate = matched["rate"].to_numpy()

    keep = ~pd.isna(rate)
    out = df.loc[keep].copy()
    for column in ("Open", "High", "Low", "Close"):
        if column in out.columns:
            out[column] = out[column].to_numpy() * rate[keep]

    note = "Each bar is converted at the USD/PHP rate of its own time (Yahoo PHP=X). When FX markets are closed, the last rate is used."
    if not keep.all():
        first = rates.index[0]
        note += f" USD/PHP history starts {first:%b %Y}, so earlier bars are left out."
    return out, note


@dataclass(frozen=True)
class Session:
    """When a market's regular day ends, in its own timezone."""

    tz: str
    end: time
    seven_day: bool  # crypto trades every day; stocks Monday to Friday


def session_from_meta(meta: dict) -> Session | None:
    tz = meta.get("exchangeTimezoneName")
    end = ((meta.get("currentTradingPeriod") or {}).get("regular") or {}).get("end")
    end_ts = _to_timestamp(end)
    if not tz or end_ts is None:
        return None
    return Session(tz, end_ts.tz_convert(tz).time(), meta.get("instrumentType") == "CRYPTOCURRENCY")


def _to_timestamp(value: Any) -> pd.Timestamp | None:
    """yfinance gives trading times as Timestamps or Unix seconds, depending on version."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return pd.Timestamp(value, unit="s", tz="UTC")
    ts = pd.Timestamp(value)
    return ts.tz_localize("UTC") if ts.tzinfo is None else ts


def close_times(index: pd.DatetimeIndex, interval: str, session: Session) -> list[int]:
    """Unix time each daily, weekly, or monthly bar closes(d): the regular close of its last trading day.

    No holiday calendar: a week's bar is assumed to close on Friday (Sunday for crypto).
    """
    local = (index if index.tz is not None else index.tz_localize("UTC")).tz_convert(session.tz)
    whole_day = session.end >= time(23, 59)  # Yahoo marks 24h markets as closing at 23:59
    out = []
    for ts in local:
        last = ts.date()
        if interval == "1wk":
            last += timedelta(days=6 if session.seven_day else 4)
        elif interval == "1mo":
            last = (pd.Timestamp(last) + pd.offsets.MonthEnd(0)).date()
            while not session.seven_day and last.weekday() >= 5:
                last -= timedelta(days=1)
        moment = datetime.combine(last + timedelta(days=1), time(0)) if whole_day else datetime.combine(last, session.end)
        out.append(int(pd.Timestamp(moment).tz_localize(session.tz, ambiguous=True, nonexistent="shift_forward").timestamp()))
    return out


def shape_chart(
    ticker: Ticker,
    rng: str,
    interval: str,
    df: pd.DataFrame | None,
    currency: str | None,
    visible_start: pd.Timestamp | None,
    meta: dict | None = None,
    conversion: dict | None = None,
) -> dict:
    if df is None or df.empty or "Close" not in df.columns:
        raise NotFound(f"No chart data for {ticker.input}")

    meta = meta or {}
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

    session = session_from_meta(meta)
    closes: list[int | None] = (
        close_times(bars.index, interval, session) if session and interval not in INTRADAY else [None] * len(bars)
    )
    candles = [
        {"time": int(ts.timestamp()), **row, "close_time": close_at}
        for ts, row, close_at in zip(bars.index, bars.to_dict("records"), closes)
    ]
    converted = bool(conversion and conversion["converted"])
    return {
        "symbol": ticker.symbol,
        "currency": "PHP" if converted else currency,
        "native_currency": currency,
        "converted": converted,
        "conversion_note": conversion["note"] if conversion else None,
        "range": rng,
        "interval": interval,
        "timezone": session.tz if session else None,
        "last_trade": _to_timestamp(meta.get("regularMarketTime")),
        "candles": candles,
    }


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


def _day_values(series: pd.Series) -> dict:
    """Last close and day change from a series of closes with the NaNs already dropped."""
    last = float(series.iloc[-1])
    prev = float(series.iloc[-2]) if len(series) > 1 else None
    return {
        "last": last,
        "prev_close": prev,
        "change": last - prev if prev is not None else None,
        "change_pct": _pct(last, prev),
        "last_date": series.index[-1].date().isoformat(),
    }


def _wei_values(series: pd.Series | None, year: int) -> dict:
    empty = {"last": None, "change": None, "change_pct": None, "ytd_pct": None, "last_date": None}
    if series is None:
        return empty
    series = series.dropna()
    if series.empty:
        return empty

    day = _day_values(series)
    year_start = pd.Timestamp(year, 1, 1)
    if series.index.tz is not None:
        year_start = year_start.tz_localize(series.index.tz)
    before_year = series[series.index < year_start]
    ytd_base = float(before_year.iloc[-1]) if not before_year.empty else None

    return {
        "last": day["last"],
        "change": day["change"],
        "change_pct": day["change_pct"],
        "ytd_pct": _pct(day["last"], ytd_base),
        "last_date": day["last_date"],
    }


# --- Batch quotes ------------------------------------------------------------


def get_quotes(symbols: list[str], today: date) -> dict[str, dict]:
    df = _call(lambda: fetch_download(symbols, today - timedelta(days=QUOTES_HISTORY_DAYS)))
    return shape_quotes(df, symbols)


def get_usd_php(today: date) -> float:
    """Yahoo's latest USD/PHP close: pesos per dollar."""
    rate = get_quotes([FX_SYMBOL], today)[FX_SYMBOL]["last"]
    if rate is None:
        raise UpstreamError("Yahoo returned no USD/PHP rate (PHP=X)")
    return rate


def shape_quotes(df: pd.DataFrame | None, symbols: list[str]) -> dict[str, dict]:
    """Per-symbol last close, day change, and recent closes. Symbols with no data get null values."""
    if df is None or df.empty or "Close" not in df.columns.get_level_values(0):
        raise UpstreamError("Yahoo returned no data for these symbols")
    closes = df["Close"]
    if isinstance(closes, pd.Series):  # a single-ticker download can come back without the ticker level
        closes = closes.to_frame(symbols[0])
    return {symbol: _quote_values(closes.get(symbol)) for symbol in symbols}


def _quote_values(series: pd.Series | None) -> dict:
    empty = {"last": None, "prev_close": None, "change": None, "change_pct": None, "last_date": None, "closes": []}
    if series is None:
        return empty
    series = series.dropna()
    if series.empty:
        return empty
    return {**_day_values(series), "closes": [float(v) for v in series.iloc[-SPARK_POINTS:]]}


# --- Ticker search -----------------------------------------------------------


def get_search(query: str) -> list[dict]:
    return shape_search(_call(lambda: fetch_search(query)))


def shape_search(quotes: list[dict] | None) -> list[dict]:
    """Matches as {ticker, symbol, name, type, exchange}. `ticker` is what to type here:
    the short alias for coins that have one (BTC-USD -> BTC), else Yahoo's symbol."""
    out = []
    for q in quotes or []:
        symbol = str(q.get("symbol") or "").upper()
        if not TICKER_RE.match(symbol):
            continue
        out.append(
            {
                "ticker": alias_name(symbol) or symbol,
                "symbol": symbol,
                "name": q.get("shortname") or q.get("longname"),
                "type": q.get("quoteType"),
                "exchange": q.get("exchDisp") or q.get("exchange"),
            }
        )
    return out


# --- Description (DES) -------------------------------------------------------


def get_des(ticker: Ticker) -> dict:
    return shape_des(ticker, _call(lambda: fetch_info(ticker.symbol)))


def shape_des(ticker: Ticker, info: dict) -> dict:
    """Profile, valuation, and 52-week range for a stock or fund. Missing fields stay null."""
    price = _num(info.get("regularMarketPrice")) or _num(info.get("currentPrice"))
    name = info.get("longName") or info.get("shortName")
    if price is None and name is None:
        raise NotFound(f"No data for ticker {ticker.input}")

    quote_type = info.get("quoteType")
    # Yahoo's own dividendYield field has changed units between versions, so compute it here.
    dividend_rate = _num(info.get("dividendRate")) or _num(info.get("trailingAnnualDividendRate"))
    dividend_yield = dividend_rate / price * 100 if dividend_rate is not None and price else None
    ex_dividend = _num(info.get("exDividendDate"))

    fund = None
    if quote_type in FUND_TYPES:
        fund = {
            "family": info.get("fundFamily"),
            "category": info.get("category"),
            "total_assets": _num(info.get("totalAssets")) or _num(info.get("netAssets")),
            "expense_ratio_pct": _num(info.get("netExpenseRatio")),  # already in percent: 0.03 means 0.03%
        }

    return {
        "symbol": ticker.symbol,
        "name": name,
        "type": quote_type,
        "exchange": info.get("fullExchangeName") or info.get("exchange"),
        "currency": info.get("currency"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "country": info.get("country"),
        "website": info.get("website"),
        "employees": _num(info.get("fullTimeEmployees")),
        "summary": info.get("longBusinessSummary"),
        "market_cap": _num(info.get("marketCap")),
        "enterprise_value": _num(info.get("enterpriseValue")),
        "beta": _num(info.get("beta")) or _num(info.get("beta3Year")),
        "year_low": _num(info.get("fiftyTwoWeekLow")),
        "year_high": _num(info.get("fiftyTwoWeekHigh")),
        "pe_trailing": _num(info.get("trailingPE")),
        "pe_forward": _num(info.get("forwardPE")),
        "price_to_book": _num(info.get("priceToBook")),
        "price_to_sales": _num(info.get("priceToSalesTrailing12Months")),
        "ev_to_ebitda": _num(info.get("enterpriseToEbitda")),
        "dividend_rate": dividend_rate,
        "dividend_yield_pct": dividend_yield,
        "ex_dividend_date": datetime.fromtimestamp(ex_dividend, tz=timezone.utc).date() if ex_dividend else None,
        "fund": fund,
    }
