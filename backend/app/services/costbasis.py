"""The cost engine: replay transactions into holdings at average cost, in pesos and dollars.

Pure functions only (no database, no network), so tests feed it small lists.

How each type moves a holding:
  BUY       units in; cost += units x price + fee
  SELL      units out at average cost; realized P&L = what you got - the cost removed
  REWARD    units in at zero cost (lowers the average cost)
  TRANSFER  the network fee (in units of the asset) leaves; the cost stays, so the average rises
  DIVIDEND  cash received, counted as income; units don't change
  DEPOSIT, WITHDRAW  a record of money in and out; no effect on holdings

The buy price is optional. A holding with any buy that has no price has no known cost, so
it shows units and value but no average cost or P&L; a sell without a price books none.

Trading fees count in the cost. Peso amounts:
  priced in PHP (Coins.ph)    the pesos paid
  priced in USD or USDT       dollars x Yahoo's USD/PHP close on the trade date
Exchange spreads and FX costs are not tracked (Derek's choice). Nothing in the past is
ever converted at today's rate.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Protocol

CASH = {"USD", "USDT", "PHP"}
DOLLARS = {"USD", "USDT"}  # USDT counts as USD
EPSILON = 1e-9  # units below this are treated as zero (float leftovers from partial sells)


@dataclass(frozen=True)
class Tx:
    id: int
    account_id: int
    trade_date: date
    type: str
    asset: str
    units: float
    price: float | None
    price_currency: str
    fee: float
    fee_currency: str | None
    php_amount: float | None

    @classmethod
    def from_row(cls, row: Mapping[str, Any]) -> "Tx":
        return cls(
            id=row["id"],
            account_id=row["account_id"],
            trade_date=date.fromisoformat(row["trade_date"]),
            type=row["type"],
            asset=row["asset"],
            units=row["units"],
            price=row["price"],
            price_currency=row["price_currency"],
            fee=row["fee"] or 0.0,
            fee_currency=row["fee_currency"],
            php_amount=row["php_amount"],
        )


class Prices(Protocol):
    def usd_php(self, day: date) -> float:
        """Yahoo's USD/PHP close on `day` (or the last one before it)."""
        ...

    def usd_close(self, asset: str, day: date) -> float | None:
        """An asset's USD close on `day` (or the last one before it); None if Yahoo has none."""
        ...


@dataclass
class Position:
    asset: str
    units: float = 0.0
    cost_php: float = 0.0
    cost_usd: float = 0.0
    realized_php: float = 0.0
    realized_usd: float = 0.0
    dividends_php: float = 0.0
    dividends_usd: float = 0.0
    cost_known: bool = True  # False once a buy without a price is part of this holding

    def add(self, units: float, php: float, usd: float) -> None:
        self.units += units
        self.cost_php += php
        self.cost_usd += usd

    def remove(self, units: float, proceeds_php: float | None, proceeds_usd: float | None) -> None:
        """Take units out at average cost and book the difference as realized P&L.
        Without proceeds (a sell with no price) or a known cost, no P&L is booked."""
        share = min(units / self.units, 1.0) if self.units > EPSILON else 1.0
        removed_php, removed_usd = self.cost_php * share, self.cost_usd * share
        if self.cost_known and proceeds_php is not None and proceeds_usd is not None:
            self.realized_php += proceeds_php - removed_php
            self.realized_usd += proceeds_usd - removed_usd
        self.units -= units
        self.cost_php -= removed_php
        self.cost_usd -= removed_usd
        if self.units < EPSILON:
            self.clear()

    def clear(self) -> None:
        """Everything sold or moved out: the next buy starts a fresh cost."""
        self.units = self.cost_php = self.cost_usd = 0.0
        self.cost_known = True


@dataclass
class Book:
    positions: dict[str, Position] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def position(self, asset: str) -> Position:
        return self.positions.setdefault(asset, Position(asset))


def to_both(amount: float, currency: str, day: date, prices: Prices) -> tuple[float, float]:
    """A cash amount as (pesos, dollars) at Yahoo's USD/PHP close on `day`."""
    rate = prices.usd_php(day)
    return (amount, amount / rate) if currency == "PHP" else (amount * rate, amount)


def _convert_cash(amount: float, src: str, dst: str, day: date, prices: Prices) -> float:
    if src == dst or (src in DOLLARS and dst in DOLLARS):
        return amount
    php, usd = to_both(amount, src, day, prices)
    return php if dst == "PHP" else usd


def replay(txs: Iterable[Tx], prices: Prices) -> Book:
    """Holdings after every transaction. `txs` must be in transactions_for_book.sql order."""
    book = Book()
    for tx in txs:
        if tx.type in ("DEPOSIT", "WITHDRAW"):
            continue
        day, p = tx.trade_date, book.position(tx.asset)

        if tx.type == "REWARD":
            p.add(tx.units, 0.0, 0.0)
        elif tx.type == "TRANSFER":
            _drop_units(p, tx.fee)
        elif tx.type == "DIVIDEND":
            php, usd = to_both(tx.units, tx.price_currency, day, prices)
            p.dividends_php += php
            p.dividends_usd += usd
        elif tx.type in ("BUY", "SELL"):
            _trade(book, p, tx, prices)
    return book


def _drop_units(p: Position, units: float) -> None:
    """Units leave but the cost stays (a transfer's network fee)."""
    p.units -= units
    if p.units < EPSILON:
        p.clear()


def _trade(book: Book, p: Position, tx: Tx, prices: Prices) -> None:
    day, currency = tx.trade_date, tx.price_currency
    gross = tx.units * (tx.price or 0.0)
    fee_native, fee_units = _fee(book, tx, prices)

    if tx.type == "BUY":
        php, usd = to_both(gross + fee_native, currency, day, prices)
        p.add(tx.units - fee_units, php, usd)
        if tx.price is None:
            p.cost_known = False
    elif tx.price is None:
        p.remove(tx.units + fee_units, None, None)
    else:
        php, usd = to_both(gross - fee_native, currency, day, prices)
        p.remove(tx.units + fee_units, php, usd)


def _fee(book: Book, tx: Tx, prices: Prices) -> tuple[float, float]:
    """The fee as (amount in the trade's price currency, units of the traded asset).

    A fee in another coin (Binance's BNB) is valued at that coin's Yahoo close and also
    leaves your BNB holding, as a small sale at its average cost.
    """
    fee, currency = tx.fee, tx.fee_currency or tx.price_currency
    if fee <= 0:
        return 0.0, 0.0
    if currency == tx.asset:
        return 0.0, fee
    if currency in CASH:
        return _convert_cash(fee, currency, tx.price_currency, tx.trade_date, prices), 0.0

    close = prices.usd_close(currency, tx.trade_date)
    if close is None:
        book.warnings.append(f"No Yahoo price for {currency} on {tx.trade_date}, so that fee counts as 0.")
        close = 0.0
    fee_usd = fee * close
    php, usd = to_both(fee_usd, "USD", tx.trade_date, prices)
    book.position(currency).remove(fee, php, usd)
    return (php if tx.price_currency == "PHP" else usd), 0.0
