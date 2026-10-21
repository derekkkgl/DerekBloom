"""FX and CMDTY: currencies from one batch download, front-month futures with gap days."""

import numpy as np
import pandas as pd
import pytest

from app.core.errors import UpstreamError
from app.core.world import COMMODITIES
from app.services import world, yahoo

DAYS = pd.to_datetime(["2025-12-30", "2025-12-31", "2026-10-19", "2026-10-20"])


def download(closes: dict[str, list[float]]) -> pd.DataFrame:
    """Shaped like yf.download(group_by='column'): columns are (field, ticker)."""
    return pd.concat({"Close": pd.DataFrame(closes, index=DAYS)}, axis=1)


FX_CLOSES = {
    "EURUSD=X": [1.10, 1.10, 1.10, 1.21],  # dollars per euro: the euro got 10% stronger on the last day
    "JPY=X": [150.0, 150.0, 150.0, 150.0],  # yen per dollar
    "GBPUSD=X": [1.30, 1.30, 1.30, 1.30],
    "CHF=X": [0.80, 0.80, 0.80, 0.80],
    "AUDUSD=X": [0.70, 0.70, 0.70, 0.70],
    "CAD=X": [1.40, 1.40, 1.40, 1.40],
    "CNY=X": [np.nan] * 4,  # Yahoo sent nothing for the yuan
    "SGD=X": [1.30, 1.30, 1.30, np.nan],  # gap on the last day
    "PHP=X": [60.0, 60.0, 60.0, 60.0],
    "DX-Y.NYB": [100.0, 100.0, 100.0, 99.0],
}


def test_every_currency_reads_the_same_way_round():
    rows = {r["code"]: r for r in world.shape_fx(download(FX_CLOSES))["rows"]}
    assert list(rows) == ["USD", "EUR", "JPY", "GBP", "CHF", "AUD", "CAD", "CNY", "SGD"]

    usd = rows["USD"]
    assert usd["per_usd"] is None and usd["change_pct"] is None
    assert usd["in_php"] == pytest.approx(60.0) and usd["in_php_change_pct"] == pytest.approx(0.0)

    eur = rows["EUR"]
    assert eur["per_usd"] == pytest.approx(1 / 1.21)
    assert eur["change_pct"] == pytest.approx(10.0)  # stronger euro is a positive move
    assert eur["in_php"] == pytest.approx(1.21 * 60)
    assert eur["closes_php"][-1] == pytest.approx(72.6)

    jpy = rows["JPY"]
    assert jpy["per_usd"] == pytest.approx(150.0) and jpy["in_php"] == pytest.approx(0.4)

    assert rows["CNY"]["in_php"] is None and rows["CNY"]["per_usd"] is None
    assert rows["SGD"]["last_date"] == "2026-10-19"


def test_cross_rate_matrix():
    matrix = world.shape_fx(download(FX_CLOSES))["matrix"]
    rows = {r["base"]: r for r in matrix["rows"]}
    assert matrix["codes"][0] == "USD" and len(rows) == 10
    for code in ("USD", "EUR", "JPY", "PHP"):
        assert rows[code][code] == pytest.approx(1.0)
    assert rows["USD"]["PHP"] == pytest.approx(60.0)
    assert rows["EUR"]["JPY"] == pytest.approx(1.21 * 150)
    assert rows["EUR"]["JPY"] * rows["JPY"]["EUR"] == pytest.approx(1.0)
    assert rows["CNY"]["USD"] is None and rows["USD"]["CNY"] is None


def test_dxy_and_missing_peso():
    data = world.shape_fx(download({k: v for k, v in FX_CLOSES.items() if k != "PHP=X"}))
    assert data["dxy"]["last"] == 99.0 and data["dxy"]["change_pct"] == pytest.approx(-1.0)
    assert all(r["in_php"] is None for r in data["rows"])
    assert data["rows"][1]["change_pct"] == pytest.approx(10.0)  # the dollar side still works


def test_empty_download_is_upstream_error():
    with pytest.raises(UpstreamError):
        world.shape_fx(pd.DataFrame())


@pytest.fixture
def fake_download(monkeypatch):
    calls = []

    def fake(symbols, start):
        calls.append(list(symbols))
        if "GC=F" in symbols:
            return download(COMMODITY_CLOSES)
        if "PHP=X" in symbols and len(symbols) == 1:
            return download({"PHP=X": [60.0] * 4})
        return download(FX_CLOSES)

    monkeypatch.setattr(yahoo, "fetch_download", fake)
    return calls


def test_fx_endpoint_one_download_and_csv(client, fake_download):
    body = client.get("/api/fx").json()
    assert len(fake_download) == 1
    assert body["data"]["rows"][1]["code"] == "EUR"
    lines = client.get("/api/fx?format=csv").text.strip().splitlines()
    assert lines[0].startswith("code,name,per_usd,change_pct,in_php")
    assert len(lines) == 10 and "closes_php" not in lines[0]


COMMODITY_CLOSES = {
    "GC=F": [4000.0, 4000.0, 4100.0, np.nan],  # futures skip days: the last real close is 4100
    "SI=F": [50.0, 50.0, 55.0, 60.0],
    "CL=F": [100.0, 100.0, 100.0, 97.0],
    "NG=F": [3.0, 3.0, 3.0, 3.0],
    "HG=F": [np.nan] * 4,
    "ZW=F": [600.0, 600.0, 630.0, 650.0],  # Yahoo quotes wheat in US cents per bushel
}


def test_commodities_gaps_ytd_and_wheat_in_dollars():
    rows = {r["symbol"]: r for r in world.shape_commodities(download(COMMODITY_CLOSES), 2026)["rows"]}
    assert [r for r in rows] == [c.symbol for c in COMMODITIES]

    gold = rows["GC=F"]
    assert gold["last_usd"] == 4100.0 and gold["last_date"] == "2026-10-19"
    assert gold["change_pct"] == pytest.approx(2.5) and gold["ytd_pct"] == pytest.approx(2.5)
    assert gold["closes"] == [4000.0, 4000.0, 4100.0]

    wheat = rows["ZW=F"]
    assert wheat["last_usd"] == pytest.approx(6.5) and wheat["unit"] == "per bushel"
    assert wheat["change_usd"] == pytest.approx(0.2)

    assert rows["HG=F"]["last_usd"] is None and rows["HG=F"]["closes"] == []


def test_commodities_endpoint_in_pesos_and_csv(client, fake_download):
    data = client.get("/api/commodities").json()["data"]
    assert data["usd_php"] == 60.0
    silver = next(r for r in data["rows"] if r["symbol"] == "SI=F")
    assert silver["last_php"] == pytest.approx(3600.0) and silver["change_php"] == pytest.approx(300.0)
    lines = client.get("/api/commodities?format=csv").text.strip().splitlines()
    assert lines[0].startswith("symbol,name,unit,last_usd") and len(lines) == 7
