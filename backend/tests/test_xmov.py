"""XMOV: crypto gainers and losers among the top 200, and CoinGecko trending coins."""

import pytest

from app.core.errors import UpstreamError
from app.services import coingecko, yahoo


def coin(id_, symbol, change_24h, change_7d):
    return {
        "id": id_, "symbol": symbol, "name": id_.title(), "market_cap_rank": 1, "current_price": 2.0,
        "market_cap": 100, "total_volume": 10,
        "price_change_percentage_24h_in_currency": change_24h,
        "price_change_percentage_7d_in_currency": change_7d,
    }


USD = [
    coin("bitcoin", "btc", 2.0, -1.0),
    coin("pumpcoin", "pump", 40.0, 90.0),
    coin("dumpcoin", "dump", -12.0, -30.0),
    coin("flatcoin", "flat", 0.0, None),
    coin("newcoin", "new", None, 5.0),  # no 24h change yet
]


@pytest.fixture
def fake_top(monkeypatch):
    calls = []

    def fake(vs_currency, sparkline):
        calls.append((vs_currency, sparkline))
        if vs_currency == "php":
            return [{**c, "current_price": c["current_price"] * 60} for c in USD]
        return USD

    monkeypatch.setattr(coingecko, "fetch_markets", fake)
    return calls


def test_movers_24h(client, fake_top):
    body = client.get("/api/crypto/movers").json()
    d = body["data"]
    assert fake_top == [("usd", True), ("php", True)]  # the CRYPTO board's list, not a download of its own
    assert (d["window"], d["universe"]) == ("24h", 5)
    assert [c["symbol"] for c in d["gainers"]] == ["PUMP", "BTC"]  # flat and unknown are neither
    assert [c["symbol"] for c in d["losers"]] == ["DUMP"]
    assert d["gainers"][0]["price_php"] == 120.0
    assert "sparkline_7d" not in d["gainers"][0]


def test_movers_7d_and_n(client, fake_top):
    d = client.get("/api/crypto/movers?window=7d&n=1").json()["data"]
    assert [c["symbol"] for c in d["gainers"]] == ["PUMP"]
    assert [c["symbol"] for c in d["losers"]] == ["DUMP"]


def test_movers_share_one_cached_download(client, fake_top):
    client.get("/api/crypto/movers?window=24h")
    client.get("/api/crypto/movers?window=7d")
    client.get("/api/crypto/markets")
    assert len(fake_top) == 2


def test_movers_bad_window_is_400(client, fake_top):
    assert client.get("/api/crypto/movers?window=1y").status_code == 400


def test_movers_csv_marks_sides(client, fake_top):
    lines = client.get("/api/crypto/movers?format=csv").text.splitlines()
    assert lines[0].startswith("side,id,ticker")
    assert [line.split(",")[0] for line in lines[1:]] == ["gainer", "gainer", "loser"]


TRENDING = {
    "coins": [
        {"item": {"id": "bitcoin", "name": "Bitcoin", "symbol": "btc", "market_cap_rank": 1,
                  "data": {"price": 80_000.0, "market_cap": "$1,600,000,000,000",
                           "price_change_percentage_24h": {"usd": 1.5, "php": 1.9}}}},
        {"item": {"id": "obscure", "name": "Obscure", "symbol": "obs", "market_cap_rank": None, "data": {}}},
    ]
}


def test_trending_shapes_and_converts(client, monkeypatch):
    monkeypatch.setattr(coingecko, "fetch_trending", lambda: TRENDING)
    monkeypatch.setattr(yahoo, "get_usd_php", lambda today: 60.0)
    body = client.get("/api/crypto/trending").json()
    btc, obs = body["data"]["coins"]
    assert (btc["ticker"], btc["symbol"], btc["change_24h_pct"], btc["change_24h_pct_php"]) == ("BTC", "BTC", 1.5, 1.9)
    assert (btc["market_cap_usd"], btc["price_php"]) == (1.6e12, 4_800_000.0)
    assert (obs["ticker"], obs["price_usd"], obs["price_php"], obs["market_cap_usd"]) == (None, None, None, None)
    assert body["data"]["usd_php"] == 60.0


def test_parse_dollars():
    assert coingecko.parse_dollars("$20,307,092") == 20_307_092.0
    assert coingecko.parse_dollars("n/a") is None
    assert coingecko.parse_dollars(None) is None
    assert coingecko.parse_dollars(5) == 5.0


def test_trending_empty_is_an_error():
    with pytest.raises(UpstreamError):
        coingecko.shape_trending({"coins": []})
