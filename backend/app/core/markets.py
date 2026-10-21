"""WEI board rows and exchange trading hours.

Open/closed status comes from the hours below, in each exchange's own timezone.
There is no holiday calendar, so on a market holiday a market can show "open".
"""

from dataclasses import dataclass
from datetime import datetime, time
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class WeiRow:
    symbol: str
    name: str
    region: str
    market: str  # key into MARKET_HOURS
    currency: str | None  # None when the value isn't a price (DXY, yields)


WEI_ROWS: list[WeiRow] = [
    WeiRow("^GSPC", "S&P 500", "Americas", "US", "USD"),
    WeiRow("^IXIC", "Nasdaq Composite", "Americas", "US", "USD"),
    WeiRow("^DJI", "Dow Jones Industrial", "Americas", "US", "USD"),
    WeiRow("^RUT", "Russell 2000", "Americas", "US", "USD"),
    WeiRow("^GSPTSE", "S&P/TSX Composite", "Americas", "TSX", "CAD"),
    WeiRow("^FTSE", "FTSE 100", "Europe", "LSE", "GBP"),
    WeiRow("^GDAXI", "DAX", "Europe", "XETRA", "EUR"),
    WeiRow("^FCHI", "CAC 40", "Europe", "PARIS", "EUR"),
    WeiRow("^STOXX50E", "Euro Stoxx 50", "Europe", "XETRA", "EUR"),
    WeiRow("^N225", "Nikkei 225", "Asia-Pacific", "TOKYO", "JPY"),
    WeiRow("^HSI", "Hang Seng", "Asia-Pacific", "HKEX", "HKD"),
    WeiRow("000001.SS", "Shanghai Composite", "Asia-Pacific", "SHANGHAI", "CNY"),
    WeiRow("^KS11", "KOSPI", "Asia-Pacific", "KRX", "KRW"),
    WeiRow("^STI", "Straits Times", "Asia-Pacific", "SGX", "SGD"),
    WeiRow("^AXJO", "S&P/ASX 200", "Asia-Pacific", "ASX", "AUD"),
    WeiRow("^BSESN", "BSE Sensex", "Asia-Pacific", "BSE", "INR"),
    WeiRow("BTC-USD", "Bitcoin", "Cross-asset", "CRYPTO", "USD"),
    WeiRow("ETH-USD", "Ethereum", "Cross-asset", "CRYPTO", "USD"),
    WeiRow("PHP=X", "USD/PHP", "Cross-asset", "FX", "PHP"),
    WeiRow("DX-Y.NYB", "US Dollar Index", "Cross-asset", "FUTURES", None),
    WeiRow("GC=F", "Gold Futures", "Cross-asset", "FUTURES", "USD"),
    WeiRow("CL=F", "WTI Crude Futures", "Cross-asset", "FUTURES", "USD"),
    WeiRow("^TNX", "US 10Y Yield (%)", "Cross-asset", "US", None),
]

REGIONS = ["Americas", "Europe", "Asia-Pacific", "Cross-asset"]


@dataclass(frozen=True)
class Sessions:
    """Weekday exchange: open Mon-Fri during any of the local sessions (lunch breaks are gaps)."""

    tz: str
    sessions: tuple[tuple[time, time], ...]


@dataclass(frozen=True)
class Weekly:
    """Near-24h market: opens Sunday evening, closes Friday evening, optional daily break."""

    tz: str
    sunday_open: time
    friday_close: time
    daily_break: tuple[time, time] | None = None


def _t(hhmm: str) -> time:
    h, m = hhmm.split(":")
    return time(int(h), int(m))


def _s(tz: str, *pairs: str) -> Sessions:
    return Sessions(tz, tuple((_t(a), _t(b)) for a, b in (p.split("-") for p in pairs)))


MARKET_HOURS: dict[str, Sessions | Weekly] = {
    "US": _s("America/New_York", "09:30-16:00"),
    "TSX": _s("America/Toronto", "09:30-16:00"),
    "LSE": _s("Europe/London", "08:00-16:30"),
    "XETRA": _s("Europe/Berlin", "09:00-17:30"),
    "PARIS": _s("Europe/Paris", "09:00-17:30"),
    "TOKYO": _s("Asia/Tokyo", "09:00-11:30", "12:30-15:30"),
    "HKEX": _s("Asia/Hong_Kong", "09:30-12:00", "13:00-16:00"),
    "SHANGHAI": _s("Asia/Shanghai", "09:30-11:30", "13:00-15:00"),
    "KRX": _s("Asia/Seoul", "09:00-15:30"),
    "SGX": _s("Asia/Singapore", "09:00-12:00", "13:00-17:00"),
    "ASX": _s("Australia/Sydney", "10:00-16:00"),
    "BSE": _s("Asia/Kolkata", "09:15-15:30"),
    "FX": Weekly("America/New_York", _t("17:00"), _t("17:00")),
    "FUTURES": Weekly("America/New_York", _t("18:00"), _t("17:00"), (_t("17:00"), _t("18:00"))),
}


def market_status(market: str, now: datetime) -> str:
    """'open' or 'closed' for a market at a timezone-aware moment."""
    if market == "CRYPTO":
        return "open"
    hours = MARKET_HOURS[market]
    local = now.astimezone(ZoneInfo(hours.tz))
    t, weekday = local.time(), local.weekday()  # Monday = 0, Sunday = 6

    if isinstance(hours, Sessions):
        if weekday >= 5:
            return "closed"
        return "open" if any(start <= t < end for start, end in hours.sessions) else "closed"

    if weekday == 5 or (weekday == 6 and t < hours.sunday_open) or (weekday == 4 and t >= hours.friday_close):
        return "closed"
    if hours.daily_break and hours.daily_break[0] <= t < hours.daily_break[1]:
        return "closed"
    return "open"
