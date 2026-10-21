"""XSEC: CoinGecko categories, with the heat-map sectors marked."""

import pytest

from app.core.errors import UpstreamError
from app.services import coingecko, yahoo


def cat(id_, cap, change=1.0, top=("bitcoin", "unknown-coin")):
    return {"id": id_, "name": id_.replace("-", " ").title(), "market_cap": cap, "market_cap_change_24h": change,
            "volume_24h": 5.0, "top_3_coins_id": list(top)}


@pytest.fixture
def fake_categories(monkeypatch):
    rows = [cat(f"filler-{i}", 1000.0 - i) for i in range(105)]
    rows += [cat("meme-token", 5.0, change=-4.2), cat("layer-1", 2000.0, change=None), cat("no-cap", None)]
    monkeypatch.setattr(coingecko, "fetch_categories", lambda: rows)
    btc = {"id": "bitcoin", "symbol": "btc", "name": "Bitcoin", "current_price": 1.0, "market_cap": 1}
    monkeypatch.setattr(coingecko, "fetch_markets", lambda vs_currency, sparkline: [btc])
    monkeypatch.setattr(yahoo, "get_usd_php", lambda today: 60.0)


def test_top_100_plus_sectors_outside_them(client, fake_categories):
    body = client.get("/api/crypto/sectors").json()
    rows = body["data"]["categories"]
    assert len(rows) == 101  # top 100 by cap, plus Memes from rank 107
    layer1, memes = rows[0], rows[-1]
    assert (layer1["rank"], layer1["sector"], layer1["change_24h_pct"]) == (1, "Layer 1", None)
    assert (memes["rank"], memes["sector"], memes["change_24h_pct"]) == (107, "Memes", -4.2)
    assert rows[1]["sector"] is None
    assert layer1["top_coins"] == "BTC, unknown-coin"  # symbol from the top-200 list, else the id
    assert (layer1["market_cap_php"], layer1["volume_24h_php"]) == (120_000.0, 300.0)
    assert body["meta"]["source"] == "coingecko"


def test_sectors_csv(client, fake_categories):
    lines = client.get("/api/crypto/sectors?format=csv").text.splitlines()
    assert lines[0].startswith("rank,id,name,sector,market_cap_usd")
    assert len(lines) == 102


def test_no_categories_is_an_error():
    with pytest.raises(UpstreamError):
        coingecko.shape_categories([{"id": "x", "market_cap": None}])


def test_top_coins_fall_back_to_ids_when_coingecko_list_is_down(client, monkeypatch):
    monkeypatch.setattr(coingecko, "fetch_categories", lambda: [cat("layer-1", 10.0)])
    monkeypatch.setattr(yahoo, "get_usd_php", lambda today: 60.0)

    def down(vs_currency, sparkline):
        raise ConnectionError("timeout")

    monkeypatch.setattr(coingecko, "fetch_markets", down)
    (row,) = client.get("/api/crypto/sectors").json()["data"]["categories"]
    assert row["top_coins"] == "bitcoin, unknown-coin"
