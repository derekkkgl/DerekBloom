"""PORT, YLD, and GOAL endpoints against a small fake Yahoo history.

USD/PHP is 58 until Sep 30 and 60 from Oct 1. Today is 2026-10-21.
VOO closes 500, then 510 today; it paid 1.80 + 1.80 + 1.90 in the last 12 months.
BTC closes 60,000, then 61,000 today. ETH is flat at 3,000.
"""

from datetime import date

import numpy as np
import pandas as pd
import pytest

from app.services import transactions, yahoo
from tests.fakes import INFO

TODAY = date(2026, 10, 21)


def fake_history(symbols: list[str]) -> pd.DataFrame:
    index = pd.date_range("2025-09-01", "2026-10-21")
    closes, dividends = {}, {}
    for s in symbols:
        if s == "PHP=X":
            closes[s] = np.where(index < "2026-10-01", 58.0, 60.0)
        elif s == "VOO":
            closes[s] = np.r_[np.full(len(index) - 1, 500.0), 510.0]
        elif s == "BTC-USD":
            closes[s] = np.r_[np.full(len(index) - 1, 60_000.0), 61_000.0]
        elif s == "ETH-USD":
            closes[s] = np.full(len(index), 3_000.0)
        else:
            closes[s] = np.full(len(index), np.nan)  # Yahoo knows nothing
        paid = pd.Series(0.0, index=index)
        if s == "VOO":
            paid[pd.Timestamp("2025-09-29")] = 1.7  # more than a year ago: not counted
            for day, amount in [("2026-03-27", 1.8), ("2026-06-26", 1.8), ("2026-09-28", 1.9)]:
                paid[pd.Timestamp(day)] = amount
        dividends[s] = paid.to_numpy()
    frames = {"Close": pd.DataFrame(closes, index=index), "Dividends": pd.DataFrame(dividends, index=index)}
    return pd.concat(frames, axis=1)


@pytest.fixture(autouse=True)
def fake_yahoo(monkeypatch):
    downloads = []

    def fake_download(symbols, start, actions=False):
        downloads.append((list(symbols), start, actions))
        return fake_history(list(symbols))

    monkeypatch.setattr(yahoo, "fetch_info", lambda symbol: INFO.get(symbol, {}))
    monkeypatch.setattr(yahoo, "fetch_download", fake_download)
    monkeypatch.setattr(transactions, "manila_today", lambda: TODAY)
    return downloads


def add(client, **fields):
    body = {"account_id": 3, "trade_date": "2026-01-20", "type": "BUY", "asset": "VOO", "units": 0.1, "price": 500, **fields}
    r = client.post("/api/transactions", json=body)
    assert r.status_code == 201, r.json()
    return r.json()["data"]["transaction"]


@pytest.fixture
def book(client):
    """Gotrade: $100 deposited for ₱5,850 (a record only), then 0.1 VOO at $500 + $1 fee (Yahoo's rate: 58).
    Coins.ph: 0.001 BTC for ₱3,500,000/BTC + ₱35 fee, and ₱1,200 cash."""
    add(client, type="DEPOSIT", asset="USD", units=100, price=None, php_amount=5_850, trade_date="2026-01-05")
    add(client, fee=1)
    add(client, account_id=1, asset="BTC", units=0.001, price=3_500_000, price_currency="PHP", fee=35, trade_date="2026-10-02")
    client.put("/api/accounts/1/cash", json={"currency": "PHP", "amount": 1_200})


def test_empty_portfolio_still_answers(client):
    data = client.get("/api/portfolio").json()["data"]
    assert data["holdings"] == [] and data["totals"]["value"] == 0
    assert data["usd_php"] == 60.0


def test_portfolio_in_pesos(client, book, fake_yahoo):
    body = client.get("/api/portfolio?currency=PHP").json()
    data, totals = body["data"], body["data"]["totals"]
    assert body["meta"]["source"] == "yahoo"
    assert fake_yahoo[-1][2] is True  # dividends requested

    voo, btc = (next(h for h in data["holdings"] if h["asset"] == a) for a in ("VOO", "BTC"))
    assert voo["cost"] == pytest.approx(51 * 58)
    assert voo["value"] == pytest.approx(0.1 * 510 * 60)
    assert voo["pnl"] == pytest.approx(3_060 - 2_958)
    assert voo["avg_cost"] == pytest.approx(29_580)
    assert voo["price"] == pytest.approx(510 * 60)
    assert voo["day_change"] == pytest.approx(0.1 * (510 - 500) * 60)
    assert btc["cost"] == pytest.approx(3_535) and btc["value"] == pytest.approx(3_660)

    assert totals["value"] == pytest.approx(3_060 + 3_660 + 1_200)
    assert totals["cost"] == pytest.approx(2_958 + 3_535)
    assert totals["unrealized"] == pytest.approx(6_720 - 6_493)
    assert totals["cash"] == 1_200
    assert voo["weight_pct"] == pytest.approx(3_060 / 7_920 * 100)

    classes = {a["label"]: a["value"] for a in data["allocation"]["class"]}
    assert classes == {"Crypto": pytest.approx(3_660), "ETFs": pytest.approx(3_060), "Cash": 1_200}
    assert data["allocation"]["class"][0]["label"] == "Crypto"  # largest first
    currencies = {a["label"]: a["value"] for a in data["allocation"]["currency"]}
    assert currencies == {"USD": pytest.approx(6_720), "PHP": 1_200}
    assert [a["account"] for a in data["accounts"]] == ["Coins.ph", "Binance", "Gotrade", "No account"]


def test_portfolio_in_dollars_uses_each_trade_days_rate(client, book):
    data = client.get("/api/portfolio?currency=USD").json()["data"]
    btc = next(h for h in data["holdings"] if h["asset"] == "BTC")
    assert btc["cost"] == pytest.approx(3_535 / 60)
    assert data["totals"]["value"] == pytest.approx(51 + 61 + 20)


def test_sell_shows_up_as_realized(client, book):
    add(client, type="SELL", units=0.05, price=520, fee=0, trade_date="2026-10-05")
    totals = client.get("/api/portfolio?currency=USD").json()["data"]["totals"]
    assert totals["realized"] == pytest.approx(0.05 * 520 - 51 / 2)


def test_buy_without_a_price_shows_value_but_no_cost(client, book):
    add(client, account_id=2, asset="ETH", units=0.1, price=None, price_currency="USDT", trade_date="2026-09-01")
    data = client.get("/api/portfolio?currency=PHP").json()["data"]
    eth = next(h for h in data["holdings"] if h["asset"] == "ETH")
    assert eth["value"] == pytest.approx(0.1 * 3_000 * 60)
    assert (eth["cost"], eth["avg_cost"], eth["pnl"], eth["pnl_pct"]) == (None, None, None, None)
    totals = data["totals"]
    assert totals["value"] == pytest.approx(3_060 + 3_660 + 18_000 + 1_200)  # still counted in value
    assert totals["cost"] == pytest.approx(2_958 + 3_535)  # but not in cost or P&L
    assert totals["unrealized"] == pytest.approx(6_720 - 6_493)
    assert any("ETH has a buy with no price" in w for w in data["warnings"])


def test_cost_is_unknown_when_no_holding_has_a_price(client):
    add(client, account_id=2, asset="BTC", units=0.002, price=None, price_currency="USDT")
    totals = client.get("/api/portfolio").json()["data"]["totals"]
    assert totals["value"] > 0
    assert (totals["cost"], totals["unrealized"], totals["unrealized_pct"]) == (None, None, None)


def test_unknown_price_is_left_out_with_a_warning(client):
    add(client, asset="DELISTED", price=1, units=10, account_id=4)
    data = client.get("/api/portfolio").json()["data"]
    assert data["holdings"][0]["value"] is None
    assert data["totals"]["value"] == 0
    assert "DELISTED" in data["warnings"][0]


def test_yahoo_down_is_502(client, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("timeout")

    monkeypatch.setattr(yahoo, "fetch_download", broken)
    r = client.get("/api/portfolio")
    assert r.status_code == 502 and "Yahoo" in r.json()["error"]["message"]


def test_portfolio_csv(client, book):
    lines = client.get("/api/portfolio?format=csv&currency=PHP").text.strip().splitlines()
    assert lines[0].startswith("asset,name,class,region,units,avg_cost,price") and len(lines) == 3


# --- YLD -----------------------------------------------------------------------


def test_yield_sources_and_withholding(client, book):
    add(client, account_id=2, asset="ETH", units=1, price=3_000, price_currency="USDT", trade_date="2026-09-01")
    add(client, account_id=2, type="REWARD", asset="ETH", units=0.01, price=None, trade_date="2026-10-10")
    assert client.put("/api/yield/btc", json={"kind": "interest", "rate_pct": 2}).status_code == 200

    data = client.get("/api/yield").json()["data"]
    rows = {r["asset"]: r for r in data["rows"]}

    voo = rows["VOO"]
    assert voo["source"] == "dividend"
    assert voo["dividend_per_share_usd"] == pytest.approx(5.5)
    assert voo["gross_year"] == pytest.approx(5.5 * 0.1 * 60)
    assert voo["withheld_year"] == pytest.approx(33 * 0.25)
    assert voo["income_year"] == pytest.approx(33 * 0.75)

    eth = rows["ETH"]
    assert eth["source"] == "rewards" and eth["income_year"] == pytest.approx(0.01 * 3_000 * 60)

    btc = rows["BTC"]
    assert (btc["source"], btc["rate_pct"]) == ("interest", 2)
    assert btc["income_year"] == pytest.approx(3_660 * 0.02)

    totals = data["totals"]
    assert totals["income_year"] == pytest.approx(24.75 + 1_800 + 73.2)
    assert totals["income_month"] == pytest.approx(totals["income_year"] / 12)
    assert totals["producing_value"] == pytest.approx(3_060 + 1.01 * 3_000 * 60 + 3_660)


def test_withholding_setting_changes_income(client, book):
    client.put("/api/settings", json={"withholding_pct": 10})
    voo = client.get("/api/yield").json()["data"]["rows"][1]
    assert voo["asset"] == "VOO" and voo["income_year"] == pytest.approx(33 * 0.9)


def test_rate_for_unknown_asset_is_404(client):
    assert client.put("/api/yield/XYZ", json={"kind": "staking", "rate_pct": 3}).status_code == 404
    assert client.put("/api/yield/XYZ", json={"kind": "dividend", "rate_pct": 3}).status_code == 400


def test_yield_csv_and_delete_rate(client, book):
    client.put("/api/yield/BTC", json={"kind": "staking", "rate_pct": 3})
    client.delete("/api/yield/BTC")
    rows = {r["asset"]: r for r in client.get("/api/yield").json()["data"]["rows"]}
    assert rows["BTC"]["source"] is None and rows["BTC"]["income_year"] == 0
    assert client.get("/api/yield?format=csv").text.startswith("asset,class,units,value,source")


# --- GOAL ---------------------------------------------------------------------


def test_goal_defaults_use_income_producing_capital(client, book):
    data = client.get("/api/goal").json()["data"]
    assert data["settings"]["target_monthly_php"] == 2_000 and data["settings"]["goal_include_all"] is False
    assert data["income_now_month"] == pytest.approx(24.75 / 12)
    assert data["if_converted_month"] == pytest.approx(7_920 * 0.05 / 12)
    assert data["capital_needed"] == pytest.approx(480_000)
    assert data["start_capital"] == pytest.approx(3_060)  # only VOO pays anything
    assert data["months_to_goal"] > 0 and data["reachable"] is True
    assert data["projection"][0]["capital"] == pytest.approx(3_060)


def test_goal_toggle_includes_everything_and_reaches_sooner(client, book):
    before = client.get("/api/goal").json()["data"]["months_to_goal"]
    settings = client.put("/api/settings", json={"goal_include_all": True}).json()["data"]
    assert settings["goal_include_all"] == 1 and settings["target_monthly_php"] == 2_000  # untouched
    data = client.get("/api/goal").json()["data"]
    assert data["start_capital"] == pytest.approx(7_920)
    assert data["months_to_goal"] <= before


def test_goal_zero_yield_is_not_reachable(client, book):
    client.put("/api/settings", json={"assumed_yield_pct": 0})
    data = client.get("/api/goal").json()["data"]
    assert data["capital_needed"] is None and data["months_to_goal"] is None
    assert data["reachable"] is False and "0%" in data["note"]


def test_bad_settings_are_400(client):
    assert client.put("/api/settings", json={"target_monthly_php": 0}).status_code == 400
    assert client.put("/api/settings", json={"assumed_yield_pct": 101}).status_code == 400
    assert client.get("/api/settings").json()["data"]["assumed_yield_pct"] == 5


def test_goal_csv_is_the_projection(client, book):
    lines = client.get("/api/goal?format=csv").text.strip().splitlines()
    assert lines[0] == "month,date,capital,income_month"
    assert lines[1].startswith("0,2026-10,")
