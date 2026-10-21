"""Checking and saving transactions you type in.

Every rule here turns into a 400 with a plain message, so the TXN screen can show it
next to the entry row. The database's CHECK constraints are the last line of defense.
"""

import sqlite3
from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field

from app.core.cache import cache
from app.core.errors import BadRequest, NotFound
from app.core.tickers import alias_name, resolve
from app.db.connection import query
from app.services import yahoo
from app.services.costbasis import CASH, DOLLARS, EPSILON

TxType = Literal["BUY", "SELL", "DEPOSIT", "WITHDRAW", "DIVIDEND", "REWARD", "TRANSFER"]
CashCurrency = Literal["USD", "USDT", "PHP"]

ASSET_INFO_TTL = 6 * 3600
MANILA = ZoneInfo("Asia/Manila")

CLASSES = {"CRYPTOCURRENCY": "crypto", "EQUITY": "stock", "ETF": "etf", "MUTUALFUND": "fund"}
# Where a listing trades, from its Yahoo suffix. No suffix means a US listing.
REGIONS = {
    "T": "Japan", "HK": "Hong Kong", "SS": "China", "SZ": "China", "KS": "South Korea", "SI": "Singapore",
    "AX": "Australia", "NS": "India", "BO": "India", "L": "United Kingdom", "DE": "Germany", "PA": "France",
    "AS": "Netherlands", "SW": "Switzerland", "TO": "Canada", "PS": "Philippines",
}


class TransactionIn(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, str_strip_whitespace=True)

    account_id: int
    trade_date: date
    type: TxType
    asset: str = Field(min_length=1, max_length=20)
    units: float = Field(ge=0)
    price: float | None = Field(default=None, ge=0)
    price_currency: CashCurrency = "USD"
    fee: float = Field(default=0, ge=0)
    fee_currency: str | None = Field(default=None, max_length=20)
    php_amount: float | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=500)


def manila_today() -> date:
    return datetime.now(MANILA).date()


def ensure_asset(conn: sqlite3.Connection, raw: str) -> str:
    """The asset's key (BTC, VOO), adding it to the assets table from Yahoo the first time."""
    text = raw.strip().upper()
    if text in CASH:
        raise BadRequest(f"{text} is cash. Record it as a DEPOSIT, or type the balance under Cash on PORT.")
    ticker = resolve(text)
    key = alias_name(ticker.symbol) or ticker.symbol
    if conn.execute(query("asset_get"), {"asset": key}).fetchone():
        return key

    try:
        result = cache.get_or_fetch(f"quote:{ticker.symbol}", ASSET_INFO_TTL, lambda: yahoo.get_quote(ticker))
    except NotFound:
        raise BadRequest(
            f"Yahoo has no data for {text}. For a coin without a short name here, use its Yahoo symbol (e.g. LINK-USD)."
        ) from None
    info = result.value
    kind = CLASSES.get(info.get("type") or "")
    if kind is None:
        raise BadRequest(f"{text} is a {info.get('type') or 'kind of listing'} the portfolio can't hold yet.")
    if info.get("currency") != "USD":
        raise BadRequest(f"{text} is priced in {info.get('currency') or 'an unknown currency'}. Only USD-priced listings are supported so far.")

    suffix = ticker.symbol.rsplit(".", 1)[1] if "." in ticker.symbol else ""
    conn.execute(
        query("asset_insert"),
        {
            "asset": key,
            "yahoo_symbol": ticker.symbol,
            "name": info.get("name"),
            "class": kind,
            "region": "Global" if kind == "crypto" else REGIONS.get(suffix, "United States"),
            "currency": info["currency"],
        },
    )
    return key


def normalize(conn: sqlite3.Connection, body: TransactionIn, today: date) -> dict:
    """Check a transaction and return the row to save. Raises BadRequest with the reason."""
    if not conn.execute("SELECT 1 FROM accounts WHERE id = ?", (body.account_id,)).fetchone():
        raise BadRequest(f"Unknown account {body.account_id}.")
    if body.trade_date > today:
        raise BadRequest(f"{body.trade_date} is in the future.")

    row = body.model_dump()
    row["trade_date"] = body.trade_date.isoformat()
    row["asset"] = body.asset.upper()
    row["note"] = body.note or None
    kind = body.type

    if kind in ("DEPOSIT", "WITHDRAW"):
        if row["asset"] not in CASH:
            raise BadRequest(f"A {kind.lower()}'s asset is the currency itself: USD, USDT, or PHP.")
        _require_units(body)
        row.update(price=None, price_currency=row["asset"], fee=0.0, fee_currency=None)
        if row["asset"] == "PHP":
            row["php_amount"] = body.php_amount if body.php_amount is not None else body.units
        return row

    row["asset"] = ensure_asset(conn, body.asset)
    row["php_amount"] = None
    if kind in ("BUY", "SELL"):
        _require_units(body)
        if body.price is None:
            raise BadRequest(f"Enter the price per unit the {kind.lower()} was made at.")
        row["fee_currency"] = _fee_currency(conn, body, row["asset"])
    elif kind == "REWARD":
        _require_units(body)
        row.update(fee=0.0, fee_currency=None)
    elif kind == "DIVIDEND":
        _require_units(body, "Enter the cash amount received.")
        row.update(price=None, fee=0.0, fee_currency=None)
    elif kind == "TRANSFER":
        row.update(price=None, fee_currency=row["asset"])  # a transfer's fee is paid in the coin moved
    return row


def _require_units(body: TransactionIn, message: str = "Units must be more than zero.") -> None:
    if body.units <= 0:
        raise BadRequest(message)


def _fee_currency(conn: sqlite3.Connection, body: TransactionIn, asset: str) -> str | None:
    """NULL when the fee is in the trade's own currency; otherwise a cash currency or a coin's key."""
    raw = (body.fee_currency or "").upper()
    if not raw or body.fee == 0 or raw == body.price_currency or (raw in DOLLARS and body.price_currency in DOLLARS):
        return None
    if raw in CASH:
        return raw
    return ensure_asset(conn, raw) if raw != asset else asset


def affected_assets(*rows: dict | sqlite3.Row | None) -> set[str]:
    """Holdings whose units a change touches: the asset itself and any coin a fee was paid in."""
    out = set()
    for row in rows:
        if row is None or row["type"] in ("DEPOSIT", "WITHDRAW", "DIVIDEND"):
            continue
        out.add(row["asset"])
        if row["fee_currency"] and row["fee_currency"] not in CASH:
            out.add(row["fee_currency"])
    return out


def check_units(conn: sqlite3.Connection, assets: set[str]) -> None:
    """Refuse a change that leaves any holding below zero at any point in time."""
    for asset in sorted(assets):
        for row in conn.execute(query("running_units"), {"asset": asset}):
            if row["units_after"] < -EPSILON:
                raise BadRequest(
                    f"That leaves {row['units_after']:.8g} {asset} after the {row['type'].lower()} on {row['trade_date']}: "
                    f"more sold, moved, or spent on fees than you held then. Check the earlier buys."
                )


def list_view(row: sqlite3.Row) -> dict:
    """A transactions_list.sql row plus its peso amount, when the database alone can say it:
    pesos entered on a deposit or withdrawal, or a trade priced in pesos. Dollar trades are
    converted at Yahoo's rate on PORT, so they have none here.
    """
    out = dict(row)
    out["peso_amount"] = None
    kind = row["type"]

    if kind in ("DEPOSIT", "WITHDRAW"):
        out["peso_amount"] = row["php_amount"]
    elif kind in ("BUY", "SELL") and row["price"] is not None and row["price_currency"] == "PHP":
        fee_currency = row["fee_currency"]
        if fee_currency is None or fee_currency == row["asset"]:
            fee = row["fee"] if fee_currency is None else 0.0
            out["peso_amount"] = row["units"] * row["price"] + (fee if kind == "BUY" else -fee)
    return out
