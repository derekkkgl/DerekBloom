from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from app.core.markets import WEI_ROWS, market_status
from app.services import yahoo


def make_download(missing: set[str] = frozenset()) -> pd.DataFrame:
    """Shaped like yf.download(group_by='column'): columns are (field, ticker)."""
    index = pd.to_datetime(["2025-12-30", "2025-12-31", "2026-01-02", "2026-01-05"])
    closes = {}
    for row in WEI_ROWS:
        closes[row.symbol] = [np.nan] * 4 if row.symbol in missing else [90.0, 100.0, 105.0, 110.0]
    # ^N225 has a gap: no bar on the last day (market closed), so its last value is 105
    closes["^N225"] = [90.0, 100.0, 105.0, np.nan]
    frames = {field: pd.DataFrame(closes, index=index) for field in ["Close", "Open"]}
    return pd.concat(frames, axis=1)


@pytest.fixture
def fake_download(monkeypatch):
    calls = []

    def fake(symbols, start):
        calls.append((symbols, start))
        return make_download(missing={"^BSESN"})

    monkeypatch.setattr(yahoo, "fetch_download", fake)
    return calls


def test_shape_wei_math_and_gaps():
    values = yahoo.shape_wei(make_download(missing={"^BSESN"}), 2026)
    spx = values["^GSPC"]
    assert spx["last"] == 110.0 and spx["change"] == 5.0
    assert spx["change_pct"] == pytest.approx(110 / 105 * 100 - 100)
    assert spx["ytd_pct"] == pytest.approx(10.0)  # vs 100 on 2025-12-31
    assert spx["last_date"] == "2026-01-05"

    nikkei = values["^N225"]
    assert nikkei["last"] == 105.0 and nikkei["last_date"] == "2026-01-02"

    assert values["^BSESN"] == {"last": None, "change": None, "change_pct": None, "ytd_pct": None, "last_date": None}


def test_symbol_absent_from_download_is_null_row():
    df = make_download().drop(columns="^STI", level=1)
    assert yahoo.shape_wei(df, 2026)["^STI"]["last"] is None


def test_empty_download_is_upstream_error():
    with pytest.raises(yahoo.UpstreamError):
        yahoo.shape_wei(pd.DataFrame(), 2026)


def test_wei_endpoint_groups_and_one_batch_call(client, fake_download):
    body = client.get("/api/wei").json()
    assert len(fake_download) == 1
    assert fake_download[0][0] == [r.symbol for r in WEI_ROWS]
    groups = body["data"]["groups"]
    assert [g["region"] for g in groups] == ["Americas", "Europe", "Asia-Pacific", "Cross-asset"]
    assert sum(len(g["rows"]) for g in groups) == len(WEI_ROWS) == 23
    row = groups[0]["rows"][0]
    assert set(row) == {
        "symbol", "name", "region", "currency", "last", "change", "change_pct", "ytd_pct", "last_date", "status",
    }
    assert row["status"] in {"open", "closed"}
    sensex = next(r for r in groups[2]["rows"] if r["symbol"] == "^BSESN")
    assert sensex["last"] is None and sensex["name"] == "BSE Sensex"


def test_wei_csv(client, fake_download):
    res = client.get("/api/wei?format=csv")
    lines = res.text.strip().splitlines()
    assert lines[0].startswith("symbol,name,region,currency,last")
    assert len(lines) == 24


def utc(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)


@pytest.mark.parametrize(
    "market, moment, expected",
    [
        ("US", "2026-10-21T14:00", "open"),  # Wed 10:00 New York
        ("US", "2026-10-21T21:00", "closed"),  # Wed 17:00 New York
        ("US", "2026-10-24T15:00", "closed"),  # Saturday
        ("TOKYO", "2026-10-21T01:00", "open"),  # Wed 10:00 Tokyo
        ("TOKYO", "2026-10-21T03:00", "closed"),  # Wed 12:00 Tokyo, lunch break
        ("TOKYO", "2026-10-21T04:00", "open"),  # Wed 13:00 Tokyo
        ("TOKYO", "2026-10-21T06:45", "closed"),  # Wed 15:45 Tokyo
        ("CRYPTO", "2026-10-24T15:00", "open"),  # Saturday, crypto never closes
        ("FX", "2026-10-25T20:00", "closed"),  # Sun 16:00 New York, before the 17:00 open
        ("FX", "2026-10-25T22:00", "open"),  # Sun 18:00 New York
        ("FX", "2026-10-23T22:00", "closed"),  # Fri 18:00 New York
        ("FUTURES", "2026-10-21T21:30", "closed"),  # Wed 17:30 New York, daily break
        ("FUTURES", "2026-10-21T22:30", "open"),  # Wed 18:30 New York
    ],
)
def test_market_status(market, moment, expected):
    assert market_status(market, utc(moment)) == expected
