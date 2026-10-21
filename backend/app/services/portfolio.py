"""PORT and YLD numbers: holdings from the cost engine, priced with one Yahoo download.

build_snapshot() reads the database and Yahoo once. The *_view() functions are pure and
turn a snapshot into what each screen shows, in pesos or dollars.

Why some of this is Python, not SQL: peso costs need Yahoo's USD/PHP rate on each trade
date, and prices come from Yahoo, so the replay and valuation happen after the queries.
"""

import sqlite3
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Literal

import pandas as pd

from app.core.cache import CacheResult, cache
from app.core.errors import UpstreamError
from app.db.connection import query
from app.services import yahoo
from app.services.costbasis import DOLLARS, Book, Tx, replay

Currency = Literal["PHP", "USD"]

HISTORY_TTL = 60  # same as quotes: prices move, the database is re-read on every request
FX = yahoo.FX_SYMBOL
YEAR = timedelta(days=365)
CLASS_LABELS = {"crypto": "Crypto", "stock": "Stocks", "etf": "ETFs", "fund": "Funds", "cash": "Cash"}
CASH_REGIONS = {"PHP": "Philippines", "USD": "United States", "USDT": "Global"}


class History:
    """Daily closes and dividends from one yf.download. Implements costbasis.Prices."""

    def __init__(self, df: pd.DataFrame | None, symbols: Mapping[str, str]):
        if df is None or df.empty or "Close" not in df.columns.get_level_values(0):
            raise UpstreamError("Yahoo returned no prices for the portfolio")
        self.symbols = dict(symbols)  # asset key -> Yahoo symbol
        self.closes = self._frame(df, "Close")
        self.dividends = self._frame(df, "Dividends") if "Dividends" in df.columns.get_level_values(0) else pd.DataFrame()
        if self._series(FX) is None:
            raise UpstreamError("Yahoo returned no USD/PHP rate (PHP=X)")

    @staticmethod
    def _frame(df: pd.DataFrame, field_name: str) -> pd.DataFrame:
        frame = df[field_name]
        if isinstance(frame, pd.Series):  # a one-symbol download can come back without the ticker level
            frame = frame.to_frame(df.columns.get_level_values(1)[0] if df.columns.nlevels > 1 else FX)
        index = pd.DatetimeIndex(frame.index)
        frame.index = (index.tz_localize(None) if index.tz is not None else index).normalize()
        return frame.sort_index()

    def _series(self, symbol: str) -> pd.Series | None:
        if symbol not in self.closes.columns:
            return None
        series = self.closes[symbol].dropna()
        return None if series.empty else series

    def close_on(self, symbol: str, day: date) -> float | None:
        """The close on `day`, or the last one before it (weekends, holidays).
        Before the history starts, the first close is used rather than nothing."""
        series = self._series(symbol)
        if series is None:
            return None
        value = series.asof(pd.Timestamp(day))
        return float(series.iloc[0] if pd.isna(value) else value)

    def last_two(self, symbol: str) -> tuple[float | None, float | None, date | None, date | None]:
        """(last close, previous close, their dates)."""
        series = self._series(symbol)
        if series is None:
            return None, None, None, None
        last, last_day = float(series.iloc[-1]), series.index[-1].date()
        if len(series) < 2:
            return last, None, last_day, None
        return last, float(series.iloc[-2]), last_day, series.index[-2].date()

    def dividends_since(self, symbol: str, since: date) -> float:
        if symbol not in self.dividends.columns:
            return 0.0
        paid = self.dividends[symbol].dropna()
        return float(paid[paid.index >= pd.Timestamp(since)].sum())

    # costbasis.Prices
    def usd_php(self, day: date) -> float:
        rate = self.close_on(FX, day)
        assert rate is not None  # checked in __init__
        return rate

    def usd_close(self, asset: str, day: date) -> float | None:
        if asset in DOLLARS:
            return 1.0
        symbol = self.symbols.get(asset)
        return self.close_on(symbol, day) if symbol else None


@dataclass
class Snapshot:
    today: date
    book: Book
    history: History
    assets: dict[str, dict]
    cash: list[dict]
    accounts: list[dict]
    result: CacheResult  # the Yahoo download, for the response's meta
    warnings: list[str] = field(default_factory=list)

    def warn(self, message: str) -> None:
        if message not in self.warnings:
            self.warnings.append(message)


def build_snapshot(conn: sqlite3.Connection, today: date) -> Snapshot:
    txs = [Tx.from_row(row) for row in conn.execute(query("transactions_for_book"))]
    assets = {row["asset"]: dict(row) for row in conn.execute(query("assets_list"))}
    symbols = {key: a["yahoo_symbol"] for key, a in assets.items()}

    # Far enough back for every trade date, a year of dividends, and the rate a week before.
    first = min([tx.trade_date for tx in txs] + [today - YEAR - timedelta(days=30)])
    start = first - timedelta(days=7)
    wanted = sorted(set(symbols.values()) | {FX})
    result = cache.get_or_fetch(
        f"portfolio:{start}:{','.join(wanted)}",
        HISTORY_TTL,
        lambda: yahoo._call(lambda: yahoo.fetch_download(wanted, start, actions=True)),
    )
    history = History(result.value, symbols)
    book = replay(txs, history)
    return Snapshot(
        today=today,
        book=book,
        history=history,
        assets=assets,
        cash=[dict(r) for r in conn.execute(query("cash_list"))],
        accounts=[dict(r) for r in conn.execute(query("accounts_list"))],
        result=result,
        warnings=list(book.warnings),
    )


# --- Holdings ----------------------------------------------------------------


def _pct(part: float | None, whole: float | None) -> float | None:
    return part / whole * 100 if part is not None and whole else None


def holding_rows(snap: Snapshot) -> list[dict]:
    """Every open position, valued in both currencies (None where Yahoo has no price)."""
    h = snap.history
    rate_now = h.usd_php(snap.today)
    rows = []
    for asset, p in sorted(snap.book.positions.items()):
        if p.units <= 0:
            continue
        info = snap.assets.get(asset, {})
        last, prev, last_day, prev_day = h.last_two(info.get("yahoo_symbol", ""))
        if last is None:
            snap.warn(f"No Yahoo price for {asset}, so it's left out of the totals.")
        rate_last = h.usd_php(last_day) if last_day else rate_now
        rate_prev = h.usd_php(prev_day) if prev_day else None
        value_usd = p.units * last if last is not None else None
        rows.append(
            {
                "asset": asset,
                "name": info.get("name"),
                "class": info.get("class"),
                "region": info.get("region"),
                "currency": info.get("currency"),
                "units": p.units,
                "price_usd": last,
                "price_php": last * rate_now if last is not None else None,
                "price_date": last_day,
                "value_usd": value_usd,
                "value_php": value_usd * rate_now if value_usd is not None else None,
                "cost_usd": p.cost_usd,
                "cost_php": p.cost_php,
                # The day's move at each day's own rate, so the peso's move counts too.
                "day_change_usd": p.units * (last - prev) if last is not None and prev is not None else None,
                "day_change_php": p.units * (last * rate_last - prev * rate_prev) if last is not None and prev is not None and rate_prev else None,
            }
        )
    return rows


def cash_rows(snap: Snapshot) -> list[dict]:
    rate = snap.history.usd_php(snap.today)
    out = []
    for c in snap.cash:
        if c["amount"] <= 0:
            continue
        php = c["amount"] if c["currency"] == "PHP" else c["amount"] * rate
        out.append({**c, "value_php": php, "value_usd": php / rate})
    return out


def _allocation(items: list[tuple[str, float]], total: float) -> list[dict]:
    sums: dict[str, float] = {}
    for label, value in items:
        sums[label] = sums.get(label, 0.0) + value
    ranked = sorted(sums.items(), key=lambda kv: -kv[1])
    return [{"label": label, "value": value, "pct": _pct(value, total)} for label, value in ranked]


def portfolio_view(snap: Snapshot, currency: Currency) -> dict:
    """Everything PORT shows, in one currency."""
    c = currency.lower()
    rate = snap.history.usd_php(snap.today)
    holdings = holding_rows(snap)
    cash = cash_rows(snap)
    priced = [r for r in holdings if r[f"value_{c}"] is not None]

    holdings_value = sum(r[f"value_{c}"] for r in priced)
    cash_value = sum(r[f"value_{c}"] for r in cash)
    total = holdings_value + cash_value
    cost = sum(r[f"cost_{c}"] for r in priced)
    day_rows = [r[f"day_change_{c}"] for r in priced if r[f"day_change_{c}"] is not None]
    day_change = sum(day_rows) if day_rows else None
    positions = snap.book.positions.values()

    rows = []
    for r in holdings:
        value, row_cost = r[f"value_{c}"], r[f"cost_{c}"]
        pnl = value - row_cost if value is not None else None
        rows.append(
            {
                "asset": r["asset"],
                "name": r["name"],
                "class": r["class"],
                "region": r["region"],
                "units": r["units"],
                "avg_cost": row_cost / r["units"],
                "price": r[f"price_{c}"],
                "price_date": r["price_date"],
                "value": value,
                "cost": row_cost,
                "pnl": pnl,
                "pnl_pct": _pct(pnl, row_cost),
                "day_change": r[f"day_change_{c}"],
                "weight_pct": _pct(value, total),
            }
        )

    by_class = [(CLASS_LABELS.get(r["class"] or "", "Other"), r[f"value_{c}"]) for r in priced]
    by_region = [(r["region"] or "Other", r[f"value_{c}"]) for r in priced]
    by_currency = [(r["currency"] or "Other", r[f"value_{c}"]) for r in priced]
    for row in cash:
        by_class.append(("Cash", row[f"value_{c}"]))
        by_region.append((CASH_REGIONS[row["currency"]], row[f"value_{c}"]))
        by_currency.append(("USD" if row["currency"] in DOLLARS else row["currency"], row[f"value_{c}"]))

    return {
        "currency": currency,
        "usd_php": rate,
        "usd_php_date": snap.history.last_two(FX)[2],
        "totals": {
            "value": total,
            "holdings_value": holdings_value,
            "cash": cash_value,
            "cost": cost,
            "unrealized": holdings_value - cost if priced else None,
            "unrealized_pct": _pct(holdings_value - cost, cost),
            "realized": sum(getattr(p, f"realized_{c}") for p in positions),
            "dividends": sum(getattr(p, f"dividends_{c}") for p in positions),
            "day_change": day_change,
            "day_change_pct": _pct(day_change, total - day_change) if day_change is not None else None,
        },
        "holdings": rows,
        "cash": [{**{k: v for k, v in r.items() if not k.startswith("value_")}, "value": r[f"value_{c}"]} for r in cash],
        "accounts": [{"account_id": a["id"], "account": a["name"]} for a in snap.accounts],
        "allocation": {
            "class": _allocation(by_class, total),
            "region": _allocation(by_region, total),
            "currency": _allocation(by_currency, total),
        },
        "warnings": snap.warnings,
    }


# --- Yield (YLD) ---------------------------------------------------------------


def yield_view(snap: Snapshot, rewards: list[Mapping[str, Any]], inputs: Mapping[str, Mapping[str, Any]], withholding_pct: float) -> dict:
    """Expected yearly income per holding, in pesos.

    One source per holding, in this order:
      dividend  Yahoo's dividends per share over the last 12 months x units now, after withholding
      rewards   REWARD rows in the last 12 months, valued on the day each arrived
      rate      a staking or interest rate you set
    """
    h = snap.history
    rate_now = h.usd_php(snap.today)
    since = snap.today - YEAR

    reward_php: dict[str, float] = {}
    for r in rewards:
        day = date.fromisoformat(r["trade_date"])
        if r["price"] is not None:
            per_unit_php = r["price"] if r["price_currency"] == "PHP" else r["price"] * h.usd_php(day)
        else:
            close = h.usd_close(r["asset"], day)
            per_unit_php = close * h.usd_php(day) if close is not None else 0.0
        reward_php[r["asset"]] = reward_php.get(r["asset"], 0.0) + r["units"] * per_unit_php

    rows = []
    for r in holding_rows(snap):
        value = r["value_php"]
        symbol = snap.assets.get(r["asset"], {}).get("yahoo_symbol", "")
        per_share = h.dividends_since(symbol, since) if r["class"] != "crypto" else 0.0
        gross = withheld = income = 0.0
        source, rate_pct = None, None
        if per_share > 0:
            source = "dividend"
            gross = per_share * r["units"] * rate_now
            withheld = gross * withholding_pct / 100
            income = gross - withheld
        elif reward_php.get(r["asset"], 0) > 0:
            source, income = "rewards", reward_php[r["asset"]]
            gross = income
        elif r["asset"] in inputs and value:
            source = inputs[r["asset"]]["kind"]
            rate_pct = inputs[r["asset"]]["rate_pct"]
            gross = income = value * rate_pct / 100
        rows.append(
            {
                "asset": r["asset"],
                "class": r["class"],
                "units": r["units"],
                "value": value,
                "source": source,
                "dividend_per_share_usd": per_share or None,
                "rate_pct": rate_pct,
                "gross_year": gross,
                "withheld_year": withheld,
                "income_year": income,
                "income_month": income / 12,
                "yield_pct": _pct(income, value),
            }
        )

    income_year = sum(r["income_year"] for r in rows)
    producing = sum(r["value"] or 0.0 for r in rows if r["income_year"] > 0)
    holdings_value = sum(r["value"] or 0.0 for r in rows)
    cash_value = sum(r["value_php"] for r in cash_rows(snap))
    return {
        "currency": "PHP",
        "withholding_pct": withholding_pct,
        "rows": rows,
        "totals": {
            "income_year": income_year,
            "income_month": income_year / 12,
            "withheld_year": sum(r["withheld_year"] for r in rows),
            "producing_value": producing,
            "total_value": holdings_value + cash_value,
            "producing_yield_pct": _pct(income_year, producing),
            "portfolio_yield_pct": _pct(income_year, holdings_value + cash_value),
        },
        "warnings": snap.warnings,
    }
