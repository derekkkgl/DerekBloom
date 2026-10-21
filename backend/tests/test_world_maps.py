"""IMAP (three ETF heat maps) and WMAP (the world tile map)."""

import numpy as np
import pandas as pd
import pytest

from app.core.errors import UpstreamError
from app.core.world import SECTOR_ETFS, WORLD_ETFS, WORLD_MARKETS
from app.services import world, yahoo

DAYS = pd.to_datetime(["2025-12-30", "2025-12-31", "2026-10-19", "2026-10-20"])


def download(symbols: list[str], gaps: dict[str, list[float]] | None = None) -> pd.DataFrame:
    closes = {s: [100.0, 100.0, 100.0, 102.0] for s in symbols}
    closes.update({k: v for k, v in (gaps or {}).items() if k in closes})
    return pd.concat({"Close": pd.DataFrame(closes, index=DAYS)}, axis=1)


INFO = {
    "VT": {"shortName": "Vanguard Total World", "totalAssets": 100e9, "currency": "USD", "quoteType": "ETF"},
    "VXUS": {"totalAssets": 80e9, "currency": "USD"},
    "EEM": {"totalAssets": 30e9, "currency": "USD"},
    "EWJ": {"totalAssets": 15e9, "currency": "USD"},
    "FXI": {"totalAssets": float("nan"), "currency": "USD"},  # Yahoo has no size: tile left off the map
    "NVDA": {"shortName": "NVIDIA", "marketCap": 4e12, "currency": "USD", "quoteType": "EQUITY"},
    "7203.T": {"shortName": "Toyota", "marketCap": 40e12, "currency": "JPY"},  # a yen size is not mixed with dollars
}


@pytest.fixture
def fakes(monkeypatch):
    calls = {"download": [], "info": [], "weights": 0}

    def fake_download(symbols, start):
        calls["download"].append(list(symbols))
        if symbols == ["PHP=X"]:
            return download(symbols)
        return download([s for s in symbols if s != "ABSENT"], {"XLE": [100.0, 100.0, 100.0, 96.0]})

    def fake_info(symbol):
        calls["info"].append(symbol)
        if symbol == "INDA":
            raise RuntimeError("Yahoo hiccup")
        return INFO.get(symbol, {})

    def fake_weights(symbol):
        calls["weights"] += 1
        return {"technology": 0.40, "energy": 0.03, "utilities": None}

    monkeypatch.setattr(yahoo, "fetch_download", fake_download)
    monkeypatch.setattr(yahoo, "fetch_info", fake_info)
    monkeypatch.setattr(yahoo, "fetch_sector_weights", fake_weights)
    monkeypatch.setattr(yahoo, "get_usd_php", lambda today: 60.0)
    return calls


def test_shape_sector_weights():
    assert world.shape_sector_weights({"technology": 0.4045, "energy": float("nan")}) == {"technology": pytest.approx(40.45)}
    with pytest.raises(UpstreamError):
        world.shape_sector_weights({})


def test_shape_size_prefers_fund_assets_and_keeps_only_dollars():
    assert world.shape_size(INFO["VT"]) == {"name": "Vanguard Total World", "size_usd": 100e9}
    assert world.shape_size(INFO["NVDA"])["size_usd"] == 4e12
    assert world.shape_size(INFO["7203.T"]) == {"name": "Toyota", "size_usd": None}
    assert world.shape_size(None) == {"name": None, "size_usd": None}


def test_imap_three_groups(client, fakes):
    body = client.get("/api/imap?symbols=NVDA,7203.T,vt").json()
    groups = {g["id"]: g for g in body["data"]["groups"]}
    assert list(groups) == ["sectors", "world", "home"]

    sectors = {r["symbol"]: r for r in groups["sectors"]["rows"]}
    assert len(sectors) == len(SECTOR_ETFS)
    assert sectors["XLK"]["weight_pct"] == pytest.approx(40.0) and sectors["XLK"]["change_pct"] == pytest.approx(2.0)
    assert sectors["XLE"]["change_pct"] == pytest.approx(-4.0)
    assert sectors["XLU"]["weight_pct"] is None

    world_rows = {r["symbol"]: r for r in groups["world"]["rows"]}
    assert list(world_rows) == [f.symbol for f in WORLD_ETFS]
    assert world_rows["VT"]["size_usd"] == 100e9 and world_rows["VT"]["size_php"] == 6e12
    assert world_rows["FXI"]["size_usd"] is None and world_rows["INDA"]["size_usd"] is None

    home = groups["home"]["rows"]
    assert [r["input"] for r in home] == ["NVDA", "7203.T", "VT"]
    assert home[0]["name"] == "NVIDIA" and home[0]["size_php"] == 2.4e14
    assert home[1]["size_usd"] is None and home[1]["change_pct"] == pytest.approx(2.0)

    # One batch download for every move (plus the USD/PHP rate), and VT's profile fetched once for both maps.
    assert len([c for c in fakes["download"] if c != ["PHP=X"]]) == 1
    assert fakes["info"].count("VT") == 1 and fakes["weights"] == 1


def test_imap_sizes_cached_a_day(client, fakes):
    client.get("/api/imap?symbols=NVDA")
    client.get("/api/imap?symbols=NVDA")
    assert fakes["info"].count("NVDA") == 1 and fakes["weights"] == 1


def test_imap_without_list_or_weights(client, fakes, monkeypatch):
    def down(symbol):
        raise RuntimeError("no funds data")

    monkeypatch.setattr(yahoo, "fetch_sector_weights", down)
    body = client.get("/api/imap").json()
    groups = {g["id"]: g for g in body["data"]["groups"]}
    assert groups["home"]["rows"] == []
    assert all(r["weight_pct"] is None for r in groups["sectors"]["rows"])


def test_imap_bad_symbol_is_400(client, fakes):
    assert client.get("/api/imap?symbols=NVDA,BAD$").status_code == 400


def test_imap_csv(client, fakes):
    lines = client.get("/api/imap?symbols=NVDA&format=csv").text.strip().splitlines()
    assert lines[0].startswith("group,symbol,name,weight_pct,change_pct")
    assert len(lines) == 1 + len(SECTOR_ETFS) + len(WORLD_ETFS) + 1


def test_world_markets_have_their_own_squares():
    squares = [(m.col, m.row) for m in WORLD_MARKETS]
    assert len(set(squares)) == len(squares)
    assert len({m.code for m in WORLD_MARKETS}) == len(WORLD_MARKETS)


def test_shape_wmap_gaps_and_missing():
    symbols = [m.symbol for m in WORLD_MARKETS if m.symbol != "^NZ50"]
    df = download(symbols, {"PSEI.PS": [np.nan, 100.0, np.nan, 101.0], "^N225": [100.0, 100.0, 104.0, np.nan]})
    markets = {m["code"]: m for m in world.shape_wmap(df, 2026)["markets"]}
    assert len(markets) == len(WORLD_MARKETS)
    us = markets["US"]
    assert (us["col"], us["row"], us["index"]) == (0, 1, "S&P 500")
    assert us["change_pct"] == pytest.approx(2.0) and us["ytd_pct"] == pytest.approx(2.0)
    assert markets["PH"]["change_pct"] == pytest.approx(1.0)  # 101 vs its previous real close, 100
    assert markets["JP"]["last"] == 104.0 and markets["JP"]["last_date"] == "2026-10-19"
    assert markets["NZ"]["last"] is None and markets["NZ"]["change_pct"] is None


def test_wmap_endpoint_and_csv(client, fakes):
    data = client.get("/api/wmap").json()["data"]
    assert data["regions"] == ["Americas", "Europe and Africa", "Asia-Pacific"]
    assert len(data["markets"]) == len(WORLD_MARKETS)
    assert fakes["download"] == [[m.symbol for m in WORLD_MARKETS]]
    lines = client.get("/api/wmap?format=csv").text.strip().splitlines()
    assert lines[0].startswith("symbol,index,country,code,region,col,row") and len(lines) == 1 + len(WORLD_MARKETS)
