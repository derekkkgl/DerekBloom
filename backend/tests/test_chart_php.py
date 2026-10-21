"""GP in pesos (each bar at its own USD/PHP rate) and each bar's close time."""

from datetime import datetime, time, timezone

import numpy as np
import pandas as pd
import pytest

from app.services import yahoo

NY = "America/New_York"


def bars(dates: list[str], closes: list[float], tz: str) -> pd.DataFrame:
    index = pd.DatetimeIndex(pd.to_datetime(dates)).tz_localize(tz)
    c = np.array(closes, dtype=float)
    return pd.DataFrame({"Open": c, "High": c + 1, "Low": c - 1, "Close": c, "Volume": 1000.0}, index=index)


# --- Which charts can convert --------------------------------------------------


@pytest.mark.parametrize(
    "meta, blocked",
    [
        ({"currency": "USD", "instrumentType": "EQUITY"}, None),
        ({"currency": "USD", "instrumentType": "CRYPTOCURRENCY"}, None),
        ({"currency": "USD", "instrumentType": "FUTURE"}, None),
        ({"currency": "USD", "instrumentType": "INDEX"}, "index"),
        ({"currency": "PHP", "instrumentType": "CURRENCY"}, "exchange rate"),
        ({"currency": "JPY", "instrumentType": "EQUITY"}, "JPY"),
        ({}, "unknown currency"),
    ],
)
def test_php_blocker(meta, blocked):
    reason = yahoo.php_blocker(meta)
    assert (reason is None) if blocked is None else (blocked in reason)


# --- Conversion math -----------------------------------------------------------


def test_daily_bars_use_the_same_days_rate_and_fridays_on_weekends():
    # Crypto trades Fri-Sun; FX (stamped at London midnight) only has Thursday and Friday.
    coin = bars(["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"], [100, 110, 120, 130], "UTC")
    fx = bars(["2026-10-15", "2026-10-16"], [58.0, 59.0], "Europe/London")
    out, note = yahoo.convert_to_php(coin, fx, intraday=False)
    assert out["Close"].tolist() == [5800, 6490, 7080, 7670]  # Sat and Sun use Friday's 59
    assert out["High"].iloc[0] == 101 * 58
    assert out["Volume"].tolist() == [1000.0] * 4  # volume stays in coins
    assert "own time" in note and "left out" not in note


def test_new_york_daily_bar_matches_the_same_trading_date():
    stock = bars(["2026-10-20"], [200], NY)  # 04:00 UTC on 20 Oct
    fx = bars(["2026-10-19", "2026-10-20"], [57.0, 58.0], "Europe/London")  # 23:00 UTC the day before
    out, _ = yahoo.convert_to_php(stock, fx, intraday=False)
    assert out["Close"].iloc[0] == 200 * 58


def test_bars_older_than_fx_history_are_dropped_not_guessed():
    stock = bars(["2003-10-01", "2003-11-01", "2003-12-01", "2004-01-01"], [1, 2, 3, 4], NY)
    fx = bars(["2003-12-01", "2004-01-01"], [55.0, 56.0], "UTC")
    out, note = yahoo.convert_to_php(stock, fx, intraday=False)
    assert out["Close"].tolist() == [165.0, 224.0]
    assert "starts Dec 2003" in note


def test_intraday_bars_use_the_latest_rate_at_or_before_them():
    idx = pd.to_datetime(["2026-10-21 14:00", "2026-10-21 14:05", "2026-10-21 14:10"]).tz_localize("UTC")
    coin = pd.DataFrame({"Open": 1.0, "High": 1.0, "Low": 1.0, "Close": [10.0, 11.0, 12.0]}, index=idx)
    fx_idx = pd.to_datetime(["2026-10-21 13:55", "2026-10-21 14:05"]).tz_localize("UTC")
    fx = pd.DataFrame({"Close": [58.0, np.nan]}, index=fx_idx)  # the 14:05 FX bar has no close
    out, _ = yahoo.convert_to_php(coin, fx, intraday=True)
    assert out["Close"].tolist() == [580.0, 638.0, 696.0]


def test_no_fx_bars_is_an_error_the_caller_reports():
    with pytest.raises(ValueError):
        yahoo.convert_to_php(bars(["2026-10-20"], [1], NY), pd.DataFrame(), intraday=False)


# --- Close times -----------------------------------------------------------------

STOCK = yahoo.Session(NY, time(16, 0), seven_day=False)
CRYPTO = yahoo.Session("UTC", time(23, 59), seven_day=True)


def utc(text: str) -> int:
    return int(datetime.fromisoformat(text).replace(tzinfo=timezone.utc).timestamp())


def test_daily_close_is_the_exchange_close():
    index = pd.DatetimeIndex(pd.to_datetime(["2026-10-20", "2026-12-01"])).tz_localize(NY)
    # 16:00 New York is 20:00 UTC in October (daylight time) and 21:00 UTC in December.
    assert yahoo.close_times(index, "1d", STOCK) == [utc("2026-10-20T20:00"), utc("2026-12-01T21:00")]


def test_crypto_daily_bar_closes_at_the_end_of_its_utc_day():
    index = pd.DatetimeIndex(pd.to_datetime(["2026-10-20"])).tz_localize("UTC")
    assert yahoo.close_times(index, "1d", CRYPTO) == [utc("2026-10-21T00:00")]


def test_weekly_and_monthly_bars_close_on_their_last_trading_day():
    monday = pd.DatetimeIndex(pd.to_datetime(["2026-10-12"])).tz_localize(NY)
    assert yahoo.close_times(monday, "1wk", STOCK) == [utc("2026-10-16T20:00")]  # Friday
    assert yahoo.close_times(monday.tz_convert("UTC"), "1wk", CRYPTO) == [utc("2026-10-19T00:00")]  # after Sunday

    may = pd.DatetimeIndex(pd.to_datetime(["2026-05-01"])).tz_localize(NY)  # 31 May 2026 is a Sunday
    assert yahoo.close_times(may, "1mo", STOCK) == [utc("2026-05-29T20:00")]


def test_session_from_meta_reads_timestamps_or_unix_seconds():
    meta = {
        "exchangeTimezoneName": NY,
        "instrumentType": "EQUITY",
        "currentTradingPeriod": {"regular": {"end": pd.Timestamp("2026-10-21 16:00", tz=NY)}},
    }
    assert yahoo.session_from_meta(meta) == STOCK
    meta["currentTradingPeriod"]["regular"]["end"] = utc("2026-10-21T20:00")
    assert yahoo.session_from_meta(meta) == STOCK
    assert yahoo.session_from_meta({}) is None


# --- Endpoint ----------------------------------------------------------------------

NVDA_META = {
    "currency": "USD",
    "instrumentType": "EQUITY",
    "exchangeTimezoneName": NY,
    "regularMarketTime": pd.Timestamp("2026-10-20 16:00:01", tz=NY),
    "currentTradingPeriod": {"regular": {"end": pd.Timestamp("2026-10-21 16:00", tz=NY)}},
}


@pytest.fixture
def fake_history(monkeypatch):
    state = {"calls": [], "fx_fail": False}

    def fake(symbol, interval, period=None, start=None):
        state["calls"].append((symbol, interval, period))
        days = pd.bdate_range("2024-01-01", "2026-10-20")
        if symbol == yahoo.FX_SYMBOL:
            if state["fx_fail"]:
                raise ConnectionError("reset")
            return bars([str(d.date()) for d in days], [58.0] * len(days), "Europe/London"), {"currency": "PHP"}
        meta = {**NVDA_META, "instrumentType": "INDEX"} if symbol == "^GSPC" else NVDA_META
        return bars([str(d.date()) for d in days], list(range(1, len(days) + 1)), NY), meta

    monkeypatch.setattr(yahoo, "fetch_history", fake)
    return state


def test_endpoint_converts_bars_and_smas_and_adds_close_times(client, fake_history):
    native = client.get("/api/chart/NVDA?range=1y").json()["data"]
    php = client.get("/api/chart/NVDA?range=1y&currency=PHP").json()["data"]
    assert (native["currency"], native["converted"], native["conversion_note"]) == ("USD", False, None)
    assert (php["currency"], php["native_currency"], php["converted"]) == ("PHP", "USD", True)
    last_usd, last_php = native["candles"][-1], php["candles"][-1]
    assert last_php["close"] == pytest.approx(last_usd["close"] * 58)
    assert last_php["sma200"] == pytest.approx(last_usd["sma200"] * 58)
    assert last_php["volume"] == last_usd["volume"]
    assert last_usd["close_time"] == utc("2026-10-20T20:00")
    assert native["timezone"] == NY and native["last_trade"] == "2026-10-20T20:00:01Z"
    assert [c[0] for c in fake_history["calls"]] == ["NVDA", "NVDA", yahoo.FX_SYMBOL]  # separate cache entries


def test_intraday_conversion_fetches_a_longer_fx_window(client, fake_history):
    client.get("/api/chart/BTC?range=1d&interval=5m&currency=PHP")
    assert fake_history["calls"][1] == (yahoo.FX_SYMBOL, "5m", "5d")


def test_index_stays_in_points_with_a_note(client, fake_history):
    data = client.get("/api/chart/^GSPC?range=1y&currency=PHP").json()["data"]
    assert data["converted"] is False and "index" in data["conversion_note"]
    assert all(call[0] != yahoo.FX_SYMBOL for call in fake_history["calls"])


def test_fx_failure_keeps_the_chart_in_usd_with_a_note(client, fake_history):
    fake_history["fx_fail"] = True
    res = client.get("/api/chart/NVDA?range=1y&currency=PHP")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["converted"] is False and data["currency"] == "USD"
    assert "USD/PHP history isn't available" in data["conversion_note"]


def test_bad_currency_is_400(client, fake_history):
    assert client.get("/api/chart/NVDA?currency=EUR").status_code == 400
