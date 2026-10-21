"""MOST and MOV: Yahoo's predefined US screeners."""

import pytest

from app.core.errors import UpstreamError
from app.services import world, yahoo

QUOTES = [
    {
        "symbol": "NVDA", "shortName": "NVIDIA Corporation", "regularMarketPrice": 180.0, "regularMarketChange": 9.0,
        "regularMarketChangePercent": 5.26, "regularMarketVolume": 300_000_000, "averageDailyVolume3Month": 200_000_000,
        "marketCap": 4.4e12, "fullExchangeName": "NasdaqGS", "currency": "USD",
    },
    # Missing fields and NaNs come back as nulls; no average volume means no relative volume.
    {"symbol": "NEWCO", "longName": "New Co Holdings", "regularMarketPrice": float("nan"), "regularMarketVolume": 1_000},
    {"shortName": "No symbol, skipped"},
]


@pytest.fixture
def fake_screen(monkeypatch):
    calls = []

    def fake(query, count):
        calls.append((query, count))
        return {"quotes": QUOTES, "total": 290}

    monkeypatch.setattr(yahoo, "fetch_screen", fake)
    monkeypatch.setattr(yahoo, "get_usd_php", lambda today: 60.0)
    return calls


def test_shape_screen_rows():
    data = world.shape_screen({"quotes": QUOTES, "total": 290})
    assert data["total"] == 290
    nvda, newco = data["rows"]
    assert nvda["rank"] == 1 and nvda["name"] == "NVIDIA Corporation" and nvda["exchange"] == "NasdaqGS"
    assert nvda["rel_volume"] == pytest.approx(1.5)
    assert newco["rank"] == 2 and newco["name"] == "New Co Holdings"
    assert newco["price_usd"] is None and newco["avg_volume_3m"] is None and newco["rel_volume"] is None


def test_empty_screen_is_a_real_answer():
    assert world.shape_screen({"quotes": []}) == {"total": None, "rows": []}


def test_missing_quotes_is_upstream_error():
    with pytest.raises(UpstreamError):
        world.shape_screen({"finance": {"error": "bad"}})


@pytest.mark.parametrize("name, query", [("most-active", "most_actives"), ("gainers", "day_gainers"), ("losers", "day_losers")])
def test_endpoint_calls_the_right_screen_with_pesos(client, fake_screen, name, query):
    body = client.get(f"/api/screen/{name}").json()
    assert fake_screen == [(query, world.SCREEN_COUNT)]
    data = body["data"]
    assert data["screen"] == name and data["usd_php"] == 60.0
    nvda = data["rows"][0]
    assert nvda["price_php"] == pytest.approx(10_800.0)
    assert nvda["change_php"] == pytest.approx(540.0)
    assert nvda["market_cap_php"] == pytest.approx(4.4e12 * 60)
    assert data["rows"][1]["price_php"] is None


def test_screen_is_cached(client, fake_screen):
    client.get("/api/screen/gainers")
    assert client.get("/api/screen/gainers").json()["meta"]["cached"] is True
    assert len(fake_screen) == 1


def test_peso_fields_null_when_usd_php_fails(client, fake_screen, monkeypatch):
    def down(today):
        raise UpstreamError("Yahoo down")

    monkeypatch.setattr(yahoo, "get_usd_php", down)
    data = client.get("/api/screen/losers").json()["data"]
    assert data["usd_php"] is None and data["rows"][0]["price_php"] is None and data["rows"][0]["price_usd"] == 180.0


def test_unknown_screen_is_400(client, fake_screen):
    res = client.get("/api/screen/penny-stocks")
    assert res.status_code == 400 and res.json()["error"]["code"] == "bad_request"


def test_screen_csv(client, fake_screen):
    lines = client.get("/api/screen/most-active?format=csv").text.strip().splitlines()
    assert lines[0].startswith("rank,symbol,name,price_usd")
    assert len(lines) == 3


def test_yahoo_failure_is_502(client, monkeypatch):
    def broken(query, count):
        raise RuntimeError("boom")

    monkeypatch.setattr(yahoo, "fetch_screen", broken)
    assert client.get("/api/screen/gainers").status_code == 502
