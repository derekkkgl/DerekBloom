import pytest

from app.services import yahoo

BTC_INFO = {
    "shortName": "Bitcoin USD",
    "quoteType": "CRYPTOCURRENCY",
    "currency": "USD",
    "fullExchangeName": "CCC",
    "regularMarketPrice": 110.0,
    "regularMarketPreviousClose": 100.0,
    "regularMarketOpen": 101.0,
    "regularMarketDayHigh": 112.0,
    "regularMarketDayLow": 99.0,
    "regularMarketVolume": 5000,
    "fiftyTwoWeekHigh": 150.0,
    "fiftyTwoWeekLow": float("nan"),
    "marketCap": None,
    "regularMarketTime": 1792526400,
}


@pytest.fixture
def fake_info(monkeypatch):
    calls = []

    def fake(symbol):
        calls.append(symbol)
        if symbol == "BTC-USD":
            return BTC_INFO
        if symbol == "BOOM":
            raise ConnectionError("connection reset")
        return {"trailingPegRatio": None}  # what Yahoo sends for unknown tickers

    monkeypatch.setattr(yahoo, "fetch_info", fake)
    return calls


def test_quote_alias_and_math(client, fake_info):
    body = client.get("/api/quote/btc").json()
    data = body["data"]
    assert fake_info == ["BTC-USD"]
    assert data["input"] == "BTC" and data["symbol"] == "BTC-USD"
    assert data["name"] == "Bitcoin USD" and data["type"] == "CRYPTOCURRENCY"
    assert data["change"] == pytest.approx(10.0)
    assert data["change_pct"] == pytest.approx(10.0)
    assert data["market_time"] == "2026-10-20T20:00:00Z"
    assert body["meta"]["source"] == "yahoo" and body["meta"]["cached"] is False


def test_missing_fields_are_null(client, fake_info):
    data = client.get("/api/quote/BTC").json()["data"]
    assert data["year_low"] is None
    assert data["market_cap"] is None


def test_second_request_is_cached_and_keeps_its_own_input(client, fake_info):
    client.get("/api/quote/BTC")
    body = client.get("/api/quote/BTC-USD").json()
    assert fake_info == ["BTC-USD"]
    assert body["meta"]["cached"] is True
    assert body["data"]["input"] == "BTC-USD"


def test_unknown_ticker_is_404(client, fake_info):
    res = client.get("/api/quote/ZZZZNOTREAL")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_invalid_ticker_is_400(client, fake_info):
    res = client.get("/api/quote/NVDA$")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "bad_request"
    assert fake_info == []


def test_upstream_failure_is_502(client, fake_info):
    res = client.get("/api/quote/BOOM")
    assert res.status_code == 502
    assert "connection reset" in res.json()["error"]["message"]
