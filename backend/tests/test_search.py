import pytest

from app.services import yahoo
from tests.fakes import INFO

YAHOO_B = [
    {"symbol": "B", "shortname": "Barrick Mining Corporation", "quoteType": "EQUITY", "exchDisp": "NYSE"},
    {"symbol": "BZ=F", "shortname": "Brent Crude Oil", "quoteType": "FUTURE", "exchDisp": "NY Mercantile"},
    {"symbol": "BTC-USD", "shortname": "Bitcoin USD", "quoteType": "CRYPTOCURRENCY", "exchDisp": "CCC"},
    {"symbol": "weird symbol!", "shortname": "Dropped", "quoteType": "EQUITY"},
]


@pytest.fixture
def fake_search(monkeypatch):
    calls = []

    def fake(query):
        calls.append(query)
        return YAHOO_B if query == "B" else []

    monkeypatch.setattr(yahoo, "fetch_search", fake)
    monkeypatch.setattr(yahoo, "fetch_info", lambda symbol: INFO.get(symbol, {}))
    return calls


def tickers(body) -> list[str]:
    return [r["ticker"] for r in body["data"]["results"]]


def test_shape_search_uses_aliases_and_drops_bad_symbols():
    rows = yahoo.shape_search(YAHOO_B)
    assert [r["ticker"] for r in rows] == ["B", "BZ=F", "BTC"]
    assert rows[2] == {"ticker": "BTC", "symbol": "BTC-USD", "name": "Bitcoin USD", "type": "CRYPTOCURRENCY", "exchange": "CCC"}


def test_b_puts_aliases_first_then_yahoo(client, fake_search):
    body = client.get("/api/search?q=b").json()
    assert tickers(body)[:4] == ["BTC", "BNB", "B", "BZ=F"]
    btc = body["data"]["results"][0]
    assert (btc["source"], btc["name"]) == ("alias", "Bitcoin")  # one BTC row, not two
    assert tickers(body).count("BTC") == 1
    assert body["meta"]["source"] == "yahoo"


def test_your_assets_come_before_yahoos(client, fake_search):
    client.post("/api/transactions", json={"account_id": 3, "trade_date": "2026-10-01", "type": "BUY", "asset": "VOO", "units": 1})
    body = client.get("/api/search?q=vanguard").json()
    assert tickers(body) == ["VOO"] and body["data"]["results"][0]["source"] == "yours"


def test_search_is_cached(client, fake_search):
    client.get("/api/search?q=b")
    client.get("/api/search?q=B")
    assert fake_search == ["B"]


def test_yahoo_down_still_returns_local_matches(client, monkeypatch):
    def broken(query):
        raise RuntimeError("timeout")

    monkeypatch.setattr(yahoo, "fetch_search", broken)
    body = client.get("/api/search?q=et").json()
    assert tickers(body) == ["ETH"] and "Yahoo" in body["data"]["error"]


def test_limit_and_bad_input(client, fake_search):
    assert len(client.get("/api/search?q=b&limit=2").json()["data"]["results"]) == 2
    assert client.get("/api/search?q=").status_code == 400
    assert client.get("/api/search?q=%20").status_code == 400


def test_local_only_never_calls_yahoo(client, fake_search):
    body = client.get("/api/search?q=b&yahoo=false").json()
    assert tickers(body) == ["BTC", "BNB"] and fake_search == []
    assert body["meta"]["source"] == "local"
