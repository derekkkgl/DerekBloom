from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from app.core.tickers import resolve
from app.services import yahoo


def make_history(n: int, start: str = "2025-01-01", tz: str | None = "America/New_York") -> pd.DataFrame:
    index = pd.date_range(start, periods=n, freq="D", tz=tz)
    close = np.arange(1, n + 1, dtype=float)  # 1, 2, 3, ... so SMAs are easy to check by hand
    return pd.DataFrame(
        {"Open": close, "High": close + 1, "Low": close - 1, "Close": close, "Adj Close": close, "Volume": 100.0},
        index=index,
    )


@pytest.fixture
def fake_history(monkeypatch):
    calls = []

    def fake(symbol, interval, period=None, start=None):
        calls.append({"symbol": symbol, "interval": interval, "period": period, "start": start})
        if symbol == "ZZZZ":
            return pd.DataFrame(), {}
        df = make_history(400)
        df.iloc[5, df.columns.get_loc("Close")] = np.nan  # a bar with no close is dropped
        return df, {"currency": "USD"}

    monkeypatch.setattr(yahoo, "fetch_history", fake)
    return calls


def test_sma_values_match_hand_math():
    t = resolve("NVDA")
    out = yahoo.shape_chart(t, "max", "1d", make_history(250), "USD", None)
    candles = out["candles"]
    assert len(candles) == 250
    assert candles[18]["sma20"] is None or np.isnan(candles[18]["sma20"])
    assert candles[19]["sma20"] == pytest.approx(np.mean(range(1, 21)))
    assert candles[249]["sma50"] == pytest.approx(np.mean(range(201, 251)))
    assert candles[249]["sma200"] == pytest.approx(np.mean(range(51, 251)))


def test_warmup_is_trimmed_so_sma200_fills_first_candle():
    t = resolve("NVDA")
    df = make_history(400, start="2025-01-01")
    visible_start = pd.Timestamp("2025-12-01", tz="UTC")
    candles = yahoo.shape_chart(t, "1y", "1d", df, "USD", visible_start)["candles"]
    assert candles[0]["time"] >= int(visible_start.timestamp())
    assert candles[0]["sma200"] is not None and not np.isnan(candles[0]["sma200"])


def test_naive_index_is_treated_as_utc():
    t = resolve("NVDA")
    candles = yahoo.shape_chart(t, "max", "1d", make_history(3, tz=None), None, None)["candles"]
    assert candles[0]["time"] == int(pd.Timestamp("2025-01-01", tz="UTC").timestamp())


def test_chart_endpoint_daily_fetches_warmup(client, fake_history):
    body = client.get("/api/chart/BTC?range=1y&interval=1d").json()
    call = fake_history[0]
    assert call["symbol"] == "BTC-USD" and call["period"] is None
    expected_start = (pd.Timestamp(datetime.now(timezone.utc)) - pd.DateOffset(years=1)).date()
    assert (expected_start - call["start"]).days == yahoo.WARMUP_DAYS["1d"]
    data = body["data"]
    assert (data["symbol"], data["currency"], data["range"], data["interval"]) == ("BTC-USD", "USD", "1y", "1d")
    assert all(c["close"] is not None for c in data["candles"])


def test_chart_endpoint_intraday_uses_period(client, fake_history):
    client.get("/api/chart/NVDA?range=5d&interval=15m")
    assert fake_history[0]["period"] == "5d" and fake_history[0]["start"] is None


@pytest.mark.parametrize(
    "query",
    ["range=1y&interval=1m", "range=1d&interval=1d", "range=6mo&interval=1mo", "range=7y", "interval=2m"],
)
def test_bad_range_or_interval_is_400(client, fake_history, query):
    res = client.get(f"/api/chart/NVDA?{query}")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "bad_request"
    assert fake_history == []


def test_unknown_ticker_is_404(client, fake_history):
    assert client.get("/api/chart/ZZZZ").status_code == 404


def test_chart_csv(client, fake_history):
    res = client.get("/api/chart/NVDA?range=max&format=csv")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert res.headers["x-data-source"] == "yahoo"
    lines = res.text.strip().splitlines()
    assert lines[0] == "time,open,high,low,close,volume,sma20,sma50,sma200"
    assert len(lines) == 400  # header + 399 bars (one NaN close dropped)
