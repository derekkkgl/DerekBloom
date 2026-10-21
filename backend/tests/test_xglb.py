"""XGLB sources: Fear & Greed (alternative.me) and stablecoin supply (DefiLlama)."""

import pytest

from app.core.errors import UpstreamError
from app.services import defillama, feargreed, yahoo

DAY = 86_400
T0 = 1_790_000_000  # a Unix time at 00:00 UTC is not needed; dates are taken in UTC


def fng_rows(values):
    """alternative.me order: newest first. values are oldest first here, for readability."""
    rows = [
        {"value": str(v), "value_classification": "Greed" if v > 50 else "Fear", "timestamp": str(T0 + i * DAY)}
        for i, v in enumerate(values)
    ]
    return {"name": "Fear and Greed Index", "data": rows[::-1], "metadata": {"error": None}}


@pytest.fixture
def fake_fng(monkeypatch):
    state = {"raw": fng_rows([40 + i for i in range(40)]), "fail": None}

    def fake(days):
        if state["fail"]:
            raise state["fail"]
        return state["raw"]

    monkeypatch.setattr(feargreed, "fetch_index", fake)
    return state


@pytest.fixture
def usd_php(monkeypatch):
    monkeypatch.setattr(yahoo, "get_usd_php", lambda today: 60.0)


def test_fear_greed_today_and_history_oldest_first(client, fake_fng):
    body = client.get("/api/crypto/fear-greed").json()
    d = body["data"]
    assert (d["value"], d["label"], d["yesterday"], d["week_ago"], d["month_ago"]) == (79, "Greed", 78, 72, 49)
    assert [p["value"] for p in d["history"][:2]] == [40, 41]
    assert d["history"][-1]["date"] == d["date"]
    assert body["meta"]["source"] == "alternative.me"


def test_fear_greed_days_trims_history(client, fake_fng):
    d = client.get("/api/crypto/fear-greed?days=5").json()["data"]
    assert [p["value"] for p in d["history"]] == [75, 76, 77, 78, 79]


def test_fear_greed_short_history_has_no_month_ago(client, fake_fng):
    fake_fng["raw"] = fng_rows([30, 31])
    d = client.get("/api/crypto/fear-greed").json()["data"]
    assert (d["value"], d["yesterday"], d["week_ago"], d["month_ago"]) == (31, 30, None, None)


def test_fear_greed_skips_bad_rows():
    raw = {"data": [{"value": "x", "timestamp": "1"}, {"value": "12", "timestamp": str(T0), "value_classification": "Extreme Fear"}]}
    assert feargreed.shape_index(raw)["value"] == 12


def test_fear_greed_api_error_is_upstream():
    with pytest.raises(UpstreamError, match="limit"):
        feargreed.shape_index({"data": [], "metadata": {"error": "limit reached"}})
    with pytest.raises(UpstreamError):
        feargreed.shape_index({"data": []})


def test_fear_greed_timeout_is_502(client, fake_fng):
    fake_fng["fail"] = TimeoutError("read timed out")
    res = client.get("/api/crypto/fear-greed")
    assert res.status_code == 502
    assert "alternative.me" in res.json()["error"]["message"]


def stable_rows(totals):
    return [
        {"date": str(T0 + i * DAY), "totalCirculatingUSD": {"peggedUSD": t, "peggedEUR": 10.0, "peggedVAR": None}}
        for i, t in enumerate(totals)
    ]


def test_stablecoins_sum_every_peg_and_convert_to_php(client, monkeypatch, usd_php):
    monkeypatch.setattr(defillama, "fetch_stablecoin_history", lambda: stable_rows([90.0] * 23 + [100.0] * 8))
    body = client.get("/api/crypto/stablecoins").json()
    d = body["data"]
    assert d["supply_usd"] == 110.0  # 100 USD-pegged + 10 EUR-pegged, valued in dollars
    assert d["change_7d_pct"] == 0.0
    assert d["change_30d_pct"] == pytest.approx(10.0)
    assert (d["supply_php"], d["usd_php"]) == (6600.0, 60.0)
    assert body["meta"]["source"] == "defillama"


def test_stablecoins_without_yahoo_rate_has_null_php(client, monkeypatch):
    def down(today):
        raise UpstreamError("Yahoo Finance rate limit reached.")

    monkeypatch.setattr(yahoo, "get_usd_php", down)
    monkeypatch.setattr(defillama, "fetch_stablecoin_history", lambda: stable_rows([5.0, 6.0]))
    d = client.get("/api/crypto/stablecoins").json()["data"]
    assert (d["supply_usd"], d["supply_php"], d["usd_php"], d["change_30d_pct"]) == (16.0, None, None, None)


def test_stablecoins_empty_is_an_error():
    with pytest.raises(UpstreamError):
        defillama.shape_stablecoins([])
