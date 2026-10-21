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


ALIASES: dict[str, Alias] = {
    "BTC": Alias("BTC-USD", "bitcoin"),
    "ETH": Alias("ETH-USD", "ethereum"),
    "XRP": Alias("XRP-USD", "ripple"),
    "SOL": Alias("SOL-USD", "solana"),
    "BNB": Alias("BNB-USD", "binancecoin"),
    "ADA": Alias("ADA-USD", "cardano"),
    "DOGE": Alias("DOGE-USD", "dogecoin"),
    "USDPHP": Alias("PHP=X"),
}

# Typing the Yahoo symbol directly (BTC-USD) should resolve the same way as the alias.
_BY_SYMBOL = {alias.symbol: alias for alias in ALIASES.values()}


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
