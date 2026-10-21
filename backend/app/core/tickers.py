"""Ticker validation and the single alias map.

Aliases win over real tickers with the same name: "BTC" means Bitcoin (BTC-USD),
not the Grayscale Bitcoin Mini Trust ETF that also trades as BTC.
"""

import re
from dataclasses import dataclass

from app.core.errors import BadRequest

TICKER_RE = re.compile(r"^[A-Z0-9.\-^=]{1,20}$")


@dataclass(frozen=True)
class Alias:
    symbol: str  # Yahoo symbol
    coingecko_id: str | None = None
    label: str = ""  # shown in ticker search


ALIASES: dict[str, Alias] = {
    "BTC": Alias("BTC-USD", "bitcoin", "Bitcoin"),
    "ETH": Alias("ETH-USD", "ethereum", "Ethereum"),
    "XRP": Alias("XRP-USD", "ripple", "XRP"),
    "SOL": Alias("SOL-USD", "solana", "Solana"),
    "BNB": Alias("BNB-USD", "binancecoin", "BNB"),
    "ADA": Alias("ADA-USD", "cardano", "Cardano"),
    "DOGE": Alias("DOGE-USD", "dogecoin", "Dogecoin"),
    "USDPHP": Alias("PHP=X", label="US dollar / Philippine peso"),
}

# Typing the Yahoo symbol directly (BTC-USD) should resolve the same way as the alias.
_BY_SYMBOL = {alias.symbol: alias for alias in ALIASES.values()}
_NAME_BY_SYMBOL = {alias.symbol: name for name, alias in ALIASES.items()}
_BY_COINGECKO_ID = {alias.coingecko_id: name for name, alias in ALIASES.items() if alias.coingecko_id}


@dataclass(frozen=True)
class Ticker:
    input: str  # what the user typed, uppercased
    symbol: str  # Yahoo symbol to request
    coingecko_id: str | None


def resolve(raw: str) -> Ticker:
    text = raw.strip().upper()
    if not TICKER_RE.match(text):
        raise BadRequest(
            f"Invalid ticker '{raw}'. Use 1-20 letters, digits, or . - ^ = (e.g. NVDA, 7203.T, PHP=X)."
        )
    alias = ALIASES.get(text) or _BY_SYMBOL.get(text)
    if alias:
        return Ticker(text, alias.symbol, alias.coingecko_id)
    return Ticker(text, text, None)


def alias_for_coin(coingecko_id: str | None) -> str | None:
    """The short ticker for a CoinGecko id ("bitcoin" -> "BTC"), or None if the coin has no alias yet."""
    return _BY_COINGECKO_ID.get(coingecko_id) if coingecko_id else None


def alias_name(symbol: str) -> str | None:
    """The short name for a Yahoo symbol ("BTC-USD" -> "BTC"), or None if it has no alias."""
    return _NAME_BY_SYMBOL.get(symbol)
