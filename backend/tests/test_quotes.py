import numpy as np
import pandas as pd
import pytest

from app.services import yahoo


def make_download(symbols: list[str]) -> pd.DataFrame:
    """Shaped like yf.download(group_by='column'): columns are (field, ticker)."""
    index = pd.to_datetime(["2026-10-15", "2026-10-16", "2026-10-19", "2026-10-20"])
    closes = {s: [100.0, 101.0, 102.0, 104.0] for s in symbols}
    if "VT" in closes:
        closes["VT"] = [50.0, np.nan, 51.0, np.nan]  # gaps: last real close is 51, the one before is 50
    if "GONE" in closes:
        closes["GONE"] = [np.nan] * 4
    frames = {field: pd.DataFrame(closes, index=index) for field in ["Close", "Volume"]}
    return pd.concat(frames, axis=1)


@pytest.fixture
def fake_download(monkeypatch):
    calls = []

    def fake(symbols, start):
        calls.append((list(symbols), start))
        return make_download([s for s in symbols if s != "ABSENT"])

    monkeypatch.setattr(yahoo, "fetch_download", fake)
    return calls


def test_shape_quotes_math_gaps_and_missing():
    values = yahoo.shape_quotes(make_download(["AAPL", "VT", "GONE"]), ["AAPL", "VT", "GONE", "ABSENT"])
    aapl = values["AAPL"]
    assert (aapl["last"], aapl["prev_close"], aapl["change"]) == (104.0, 102.0, 2.0)
    assert aapl["change_pct"] == pytest.approx(104 / 102 * 100 - 100)
    assert aapl["last_date"] == "2026-10-20"
    assert aapl["closes"] == [100.0, 101.0, 102.0, 104.0]

    vt = values["VT"]
    assert (vt["last"], vt["prev_close"], vt["last_date"]) == (51.0, 50.0, "2026-10-19")
    assert vt["closes"] == [50.0, 51.0]

    for missing in ("GONE", "ABSENT"):
        assert values[missing]["last"] is None and values[missing]["closes"] == []


def test_single_ticker_download_without_ticker_level():
    df = make_download(["NVDA"]).droplevel(1, axis=1)
    assert yahoo.shape_quotes(df, ["NVDA"])["NVDA"]["last"] == 104.0


def test_sparkline_is_capped_to_about_a_month():
    index = pd.bdate_range("2026-08-01", periods=40)
    df = pd.concat({"Close": pd.DataFrame({"AAPL": np.arange(40.0)}, index=index)}, axis=1)
    closes = yahoo.shape_quotes(df, ["AAPL"])["AAPL"]["closes"]
    assert len(closes) == yahoo.SPARK_POINTS and closes[-1] == 39.0


def test_empty_download_is_upstream_error():
    with pytest.raises(yahoo.UpstreamError):
        yahoo.shape_quotes(pd.DataFrame(), ["AAPL"])


def test_endpoint_one_batch_call_keeps_order_and_aliases(client, fake_download):
    body = client.get("/api/quotes?symbols=nvda, AAPL,btc,BTC-USD,ABSENT").json()
    assert len(fake_download) == 1
    assert fake_download[0][0] == ["AAPL", "ABSENT", "BTC-USD", "NVDA"]  # sorted, one per Yahoo symbol
    rows = body["data"]["quotes"]
    assert [(r["input"], r["symbol"]) for r in rows] == [
        ("NVDA", "NVDA"), ("AAPL", "AAPL"), ("BTC", "BTC-USD"), ("ABSENT", "ABSENT"),
    ]
    assert rows[3]["last"] is None
    assert body["meta"]["source"] == "yahoo"


def test_same_set_in_another_order_hits_the_cache(client, fake_download):
    client.get("/api/quotes?symbols=AAPL,NVDA")
    body = client.get("/api/quotes?symbols=NVDA,AAPL").json()
    assert len(fake_download) == 1 and body["meta"]["cached"] is True
    assert [r["symbol"] for r in body["data"]["quotes"]] == ["NVDA", "AAPL"]


def test_csv_drops_closes(client, fake_download):
    lines = client.get("/api/quotes?symbols=AAPL,VT&format=csv").text.strip().splitlines()
    assert lines[0] == "input,symbol,last,prev_close,change,change_pct,last_date"
    assert len(lines) == 3


@pytest.mark.parametrize(
    "query, message",
    [
        ("symbols=", "at least one symbol"),
        ("symbols=,,", "at least one symbol"),
        ("symbols=AAPL,BAD$", "Invalid ticker"),
        ("symbols=" + ",".join(f"T{i}" for i in range(26)), "Too many symbols"),
        ("", "symbols"),
    ],
)
def test_bad_input_is_400(client, fake_download, query, message):
    res = client.get(f"/api/quotes?{query}")
    assert res.status_code == 400
    assert message in res.json()["error"]["message"]
    assert fake_download == []
