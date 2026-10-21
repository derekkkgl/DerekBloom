import pytest

from app.core.errors import UpstreamError
from app.services import coingecko


def coin(id_, symbol, price, cap, **extra):
    return {
        "id": id_,
        "symbol": symbol,
        "name": id_.title(),
        "market_cap_rank": extra.get("rank", 1),
        "current_price": price,
        "market_cap": cap,
        "total_volume": 10,
        "price_change_percentage_1h_in_currency": 0.1,
        "price_change_percentage_24h_in_currency": None,
        "price_change_percentage_7d_in_currency": -3.0,
        **({"sparkline_in_7d": {"price": [1.0, 2.0]}} if extra.get("spark") else {}),
    }


USD = [coin("bitcoin", "btc", 100.0, 1000, spark=True), coin("newcoin", "new", 0.5, 5, rank=2)]
PHP = [coin("bitcoin", "btc", 6300.0, 63000, spark=True)]  # newcoin missing from the PHP list


@pytest.fixture
def fake_markets(monkeypatch):
    state = {"fail": None, "calls": []}

    def fake(vs_currency, sparkline):
        state["calls"].append((vs_currency, sparkline))
        if state["fail"]:
            raise state["fail"]
        return USD if vs_currency == "usd" else PHP

    monkeypatch.setattr(coingecko, "fetch_markets", fake)
    return state


def test_markets_merge_usd_and_php(client, fake_markets):
    body = client.get("/api/crypto/markets").json()
    btc, new = body["data"]["coins"]
    assert fake_markets["calls"] == [("usd", True), ("php", True)]
    assert (btc["symbol"], btc["price_usd"], btc["price_php"], btc["market_cap_php"]) == ("BTC", 100.0, 6300.0, 63000)
    assert btc["sparkline_7d"] == [1.0, 2.0] and btc["sparkline_7d_php"] == [1.0, 2.0]
    assert btc["change_24h_pct"] is None
    assert (btc["change_1h_pct_php"], btc["change_7d_pct_php"], btc["volume_php"]) == (0.1, -3.0, 10)
    assert (new["price_php"], new["market_cap_php"], new["sparkline_7d"], new["sparkline_7d_php"]) == (None, None, [], [])
    assert new["change_24h_pct_php"] is None
    assert body["meta"]["source"] == "coingecko"


def test_markets_ticker_only_for_aliased_coins(client, fake_markets):
    btc, new = client.get("/api/crypto/markets").json()["data"]["coins"]
    assert btc["ticker"] == "BTC"
    assert new["ticker"] is None


def test_rate_limit_serves_stale_copy(client, fake_markets):
    from app.core.cache import cache

    client.get("/api/crypto/markets")
    entry = cache._entries["crypto:markets"]
    cache._entries["crypto:markets"] = type(entry)(entry.value, entry.fetched_at - 3600)
    fake_markets["fail"] = UpstreamError("CoinGecko rate limit reached (HTTP 429). Try again in a minute.")
    body = client.get("/api/crypto/markets").json()
    assert body["meta"]["stale"] is True
    assert body["data"]["coins"][0]["id"] == "bitcoin"


def test_rate_limit_with_nothing_cached_is_502(client, fake_markets):
    fake_markets["fail"] = UpstreamError("CoinGecko rate limit reached (HTTP 429). Try again in a minute.")
    res = client.get("/api/crypto/markets")
    assert res.status_code == 502
    assert "429" in res.json()["error"]["message"]


def test_network_error_is_wrapped(client, fake_markets):
    fake_markets["fail"] = ConnectionError("dns failure")
    res = client.get("/api/crypto/markets")
    assert res.status_code == 502
    assert "dns failure" in res.json()["error"]["message"]


def test_empty_response_is_an_error():
    with pytest.raises(UpstreamError):
        coingecko.shape_markets([], [])


def test_markets_csv_drops_sparkline(client, fake_markets):
    header = client.get("/api/crypto/markets?format=csv").text.splitlines()[0]
    assert "sparkline" not in header
    assert header.startswith("id,ticker,symbol,name,rank,price_usd,price_php")


GLOBAL = {
    "data": {
        "active_cryptocurrencies": 17000,
        "total_market_cap": {"usd": 3.9e12, "php": 2.4e14},
        "total_volume": {"usd": 1.5e11},  # PHP volume missing
        "market_cap_percentage": {"btc": 58.1, "eth": 12.4},
        "market_cap_change_percentage_24h_usd": float("nan"),
    }
}


@pytest.fixture
def fake_global(monkeypatch):
    state = {"fail": None}

    def fake():
        if state["fail"]:
            raise state["fail"]
        return GLOBAL

    monkeypatch.setattr(coingecko, "fetch_global", fake)
    return state


def test_global_shapes_dominance_and_caps(client, fake_global):
    body = client.get("/api/crypto/global").json()
    d = body["data"]
    assert (d["btc_dominance_pct"], d["eth_dominance_pct"]) == (58.1, 12.4)
    assert (d["market_cap_usd"], d["market_cap_php"]) == (3.9e12, 2.4e14)
    assert d["volume_24h_php"] is None
    assert d["market_cap_change_24h_pct"] is None  # NaN cleaned to null
    assert body["meta"]["source"] == "coingecko"


def test_global_failure_with_nothing_cached_is_502(client, fake_global):
    fake_global["fail"] = ConnectionError("timeout")
    res = client.get("/api/crypto/global")
    assert res.status_code == 502
    assert "timeout" in res.json()["error"]["message"]


def test_global_without_data_is_an_error():
    with pytest.raises(UpstreamError):
        coingecko.shape_global({"status": {"error_code": 1}})
