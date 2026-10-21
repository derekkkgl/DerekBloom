"""World markets from Yahoo: US screeners (MOST, MOV), currencies (FX), futures (CMDTY), ETF heat maps (IMAP),
and the world tile map (WMAP).

The network calls are yahoo.fetch_*; everything here is shaping, so tests stub the fetchers and run this for real.
"""

from datetime import date, timedelta

import pandas as pd

from app.core.errors import UpstreamError
from app.core.world import COMMODITIES, DXY_SYMBOL, FX_PAIRS, MATRIX_CODES
from app.services import yahoo
from app.services.yahoo import QUOTES_HISTORY_DAYS, SPARK_POINTS, _call, _num, _quote_values, _wei_values

# --- Screeners (MOST, MOV) ---------------------------------------------------

# Our URL name -> Yahoo's predefined screener.
SCREENS = {"most-active": "most_actives", "gainers": "day_gainers", "losers": "day_losers"}
SCREEN_COUNT = 25


def get_screen(name: str) -> dict:
    return shape_screen(_call(lambda: yahoo.fetch_screen(SCREENS[name], SCREEN_COUNT)))


def shape_screen(raw: dict | None) -> dict:
    """Screener rows in Yahoo's order. An empty list is a real answer: nothing met the screen's filter today.

    Prices are in dollars: the screeners only cover US listings.
    """
    if not isinstance(raw, dict) or not isinstance(raw.get("quotes"), list):
        raise UpstreamError("Yahoo returned no screener results")
    rows = []
    for quote in raw["quotes"]:
        symbol = quote.get("symbol")
        if not symbol:
            continue
        volume = _num(quote.get("regularMarketVolume"))
        average = _num(quote.get("averageDailyVolume3Month"))
        rows.append({
            "rank": len(rows) + 1,
            "symbol": symbol,
            "name": quote.get("shortName") or quote.get("longName"),
            "price_usd": _num(quote.get("regularMarketPrice")),
            "change_usd": _num(quote.get("regularMarketChange")),
            "change_pct": _num(quote.get("regularMarketChangePercent")),
            "volume": volume,
            "avg_volume_3m": average,
            "rel_volume": volume / average if volume is not None and average else None,
            "market_cap_usd": _num(quote.get("marketCap")),
            "exchange": quote.get("fullExchangeName") or quote.get("exchange"),
            "currency": quote.get("currency"),
        })
    return {"total": _num(raw.get("total")), "rows": rows}


def _closes(df: pd.DataFrame | None, what: str) -> pd.DataFrame:
    if df is None or df.empty or "Close" not in df.columns.get_level_values(0):
        raise UpstreamError(f"Yahoo returned no data for {what}")
    return df["Close"]


def _last(series: pd.Series | None) -> float | None:
    if series is None:
        return None
    series = series.dropna()
    return float(series.iloc[-1]) if not series.empty else None


# --- Currencies (FX) ---------------------------------------------------------

CURRENCY_NAMES = {"USD": "US dollar", **{p.code: p.name for p in FX_PAIRS}}


def get_fx(today: date) -> dict:
    symbols = [p.symbol for p in FX_PAIRS] + [DXY_SYMBOL]
    df = _call(lambda: yahoo.fetch_download(symbols, today - timedelta(days=QUOTES_HISTORY_DAYS)))
    return shape_fx(df)


def shape_fx(df: pd.DataFrame | None) -> dict:
    """Each currency against the dollar and the peso, the dollar index, and a cross-rate matrix.

    Yahoo quotes some pairs as dollars per unit (EURUSD=X) and others as units per dollar (JPY=X),
    so every currency is first turned into "dollars per one unit". Then a rise always means that
    currency got stronger, and any cross rate is one division.
    """
    closes = _closes(df, "currencies")
    usd_value: dict[str, pd.Series] = {"USD": pd.Series(1.0, index=closes.index)}
    for pair in FX_PAIRS:
        series = closes.get(pair.symbol)
        if series is None:
            continue
        series = series.where(series > 0)  # a zero would turn into an infinite rate
        usd_value[pair.code] = series if pair.usd_per_unit else 1 / series

    peso = usd_value.get("PHP")
    rows = []
    for code in CURRENCY_NAMES:
        if code == "PHP":
            continue  # the peso is the "in pesos" column itself
        value = usd_value.get(code)
        vs_usd = _quote_values(value if code != "USD" else None)
        in_php = _quote_values(value / peso if value is not None and peso is not None else None)
        rows.append({
            "code": code,
            "name": CURRENCY_NAMES[code],
            "per_usd": 1 / vs_usd["last"] if vs_usd["last"] else None,
            "change_pct": vs_usd["change_pct"],  # positive: this currency got stronger against the dollar
            "in_php": in_php["last"],
            "in_php_change_pct": in_php["change_pct"],  # positive: one unit buys more pesos than yesterday
            "last_date": in_php["last_date"] or vs_usd["last_date"],
            "closes_php": in_php["closes"],
        })

    dxy = _quote_values(closes.get(DXY_SYMBOL))
    latest = {code: _last(usd_value.get(code)) for code in MATRIX_CODES}
    matrix = [
        {"base": a, **{b: latest[a] / latest[b] if latest[a] and latest[b] else None for b in MATRIX_CODES}}
        for a in MATRIX_CODES
    ]
    return {
        "rows": rows,
        "dxy": {k: dxy[k] for k in ("last", "change", "change_pct", "last_date", "closes")},
        "matrix": {"codes": MATRIX_CODES, "rows": matrix},
    }


# --- Commodities (CMDTY) -----------------------------------------------------


def get_commodities(today: date) -> dict:
    start = date(today.year - 1, 12, 1)  # enough history to find last year's final close
    df = _call(lambda: yahoo.fetch_download([c.symbol for c in COMMODITIES], start))
    return shape_commodities(df, today.year)


def shape_commodities(df: pd.DataFrame | None, year: int) -> dict:
    """Front-month futures in dollars per unit, with day and year-to-date change. Gap days are skipped."""
    closes = _closes(df, "commodities")
    rows = []
    for commodity in COMMODITIES:
        series = closes.get(commodity.symbol)
        if series is not None:
            series = series.dropna() * commodity.scale
        values = _wei_values(series, year)
        rows.append({
            "symbol": commodity.symbol,
            "name": commodity.name,
            "unit": commodity.unit,
            "last_usd": values["last"],
            "change_usd": values["change"],
            "change_pct": values["change_pct"],
            "ytd_pct": values["ytd_pct"],
            "last_date": values["last_date"],
            "closes": [float(v) for v in series.iloc[-SPARK_POINTS:]] if series is not None else [],
        })
    return {"rows": rows}
