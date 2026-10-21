"""World markets from Yahoo: US screeners (MOST, MOV), currencies (FX), futures (CMDTY), ETF heat maps (IMAP),
and the world tile map (WMAP).

The network calls are yahoo.fetch_*; everything here is shaping, so tests stub the fetchers and run this for real.
"""

from app.core.errors import UpstreamError
from app.services import yahoo
from app.services.yahoo import _call, _num

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
