"""DEFI: chains, protocols, and total TVL from DefiLlama."""

import pytest

from app.core.cache import cache
from app.core.errors import UpstreamError
from app.services import defillama, yahoo

DAY = 86_400
T0 = 1_790_000_000

CHAINS = [
    {"name": "Base", "tvl": 25.0, "tokenSymbol": None},
    {"name": "Ethereum", "tvl": 75.0, "tokenSymbol": "ETH"},
    {"name": "Deadchain", "tvl": 0, "tokenSymbol": "DEAD"},
    {"name": "Broken", "tvl": None},
]

PROTOCOLS = [
    {"name": "Binance CEX", "category": "CEX", "tvl": 1000.0, "chains": ["BSC"]},
    {"name": "Lido", "symbol": "LDO", "category": "Liquid Staking", "chain": "Multi-Chain", "chains": ["Ethereum", "Solana"],
     "tvl": 30.0, "change_1d": 1.5, "change_7d": float("nan")},
    {"name": "Aave V3", "symbol": "-", "category": "Lending", "chain": "Ethereum", "chains": ["Ethereum"], "tvl": 40.0, "change_1d": None},
    {"name": "No TVL", "category": "Dexs", "tvl": None},
]


@pytest.fixture
def usd_php(monkeypatch):
    monkeypatch.setattr(yahoo, "get_usd_php", lambda today: 50.0)


def test_chains_ranked_with_share(client, monkeypatch, usd_php):
    monkeypatch.setattr(defillama, "fetch_chains", lambda: CHAINS)
    body = client.get("/api/defi/chains").json()
    eth, base = body["data"]["chains"]
    assert (eth["rank"], eth["name"], eth["share_pct"], eth["tvl_php"]) == (1, "Ethereum", 75.0, 3750.0)
    assert (base["rank"], base["token"], base["share_pct"]) == (2, None, 25.0)
    assert body["meta"]["source"] == "defillama"


def test_protocols_leave_out_exchanges(client, monkeypatch, usd_php):
    monkeypatch.setattr(defillama, "fetch_protocols", lambda: PROTOCOLS)
    aave, lido = client.get("/api/defi/protocols").json()["data"]["protocols"]
    assert (aave["name"], aave["symbol"], aave["change_1d_pct"]) == ("Aave V3", None, None)
    assert (lido["chain_count"], lido["change_1d_pct"], lido["change_7d_pct"]) == (2, 1.5, None)  # NaN -> null
    assert lido["tvl_php"] == 1500.0


def test_protocols_csv(client, monkeypatch, usd_php):
    monkeypatch.setattr(defillama, "fetch_protocols", lambda: PROTOCOLS)
    res = client.get("/api/defi/protocols?format=csv")
    assert res.headers["content-type"].startswith("text/csv")
    lines = res.text.splitlines()
    assert lines[0].startswith("rank,name,symbol,category")
    assert len(lines) == 3


def test_tvl_changes_skip_zero_days(client, monkeypatch, usd_php):
    # 3 zero days (before DeFi), then 40 days rising by 1 from 100.
    raw = [{"date": T0 + i * DAY, "tvl": 0} for i in range(3)]
    raw += [{"date": T0 + (3 + i) * DAY, "tvl": 100.0 + i} for i in range(40)]
    monkeypatch.setattr(defillama, "fetch_tvl_history", lambda: raw)
    d = client.get("/api/defi/tvl?days=10").json()["data"]
    assert d["tvl_usd"] == 139.0 and d["tvl_php"] == 6950.0
    assert d["change_1d_pct"] == pytest.approx(139 / 138 * 100 - 100)
    assert d["change_30d_pct"] == pytest.approx(139 / 109 * 100 - 100)
    assert len(d["history"]) == 10 and d["history"][-1]["value"] == 139.0


def test_value_on_or_before():
    points = [(10, 1.0), (20, 2.0), (30, 3.0)]
    assert defillama.value_on_or_before(points, 25) == 2.0
    assert defillama.value_on_or_before(points, 5) is None


def test_failure_serves_stale_then_502_when_empty(client, monkeypatch, usd_php):
    monkeypatch.setattr(defillama, "fetch_chains", lambda: CHAINS)
    client.get("/api/defi/chains")
    entry = cache._entries["defi:chains"]
    cache._entries["defi:chains"] = type(entry)(entry.value, entry.fetched_at - 7200)

    def down():
        raise ConnectionError("dns failure")

    monkeypatch.setattr(defillama, "fetch_chains", down)
    assert client.get("/api/defi/chains").json()["meta"]["stale"] is True
    cache.clear()
    res = client.get("/api/defi/chains")
    assert res.status_code == 502 and "DefiLlama" in res.json()["error"]["message"]


def test_empty_lists_are_errors():
    for shape in (defillama.shape_chains, defillama.shape_protocols, defillama.shape_tvl):
        with pytest.raises(UpstreamError):
            shape([])
