import pytest

from app.services import yahoo

INFO = {
    "BTC-USD": {"regularMarketPrice": 60_000.0, "shortName": "Bitcoin USD", "quoteType": "CRYPTOCURRENCY", "currency": "USD"},
    "BNB-USD": {"regularMarketPrice": 600.0, "shortName": "BNB USD", "quoteType": "CRYPTOCURRENCY", "currency": "USD"},
    "VOO": {"regularMarketPrice": 500.0, "shortName": "Vanguard S&P 500 ETF", "quoteType": "ETF", "currency": "USD"},
    "NVDA": {"regularMarketPrice": 180.0, "shortName": "NVIDIA", "quoteType": "EQUITY", "currency": "USD"},
    "7203.T": {"regularMarketPrice": 2_900.0, "shortName": "Toyota", "quoteType": "EQUITY", "currency": "JPY"},
    "^GSPC": {"regularMarketPrice": 6_000.0, "shortName": "S&P 500", "quoteType": "INDEX", "currency": "USD"},
}


@pytest.fixture(autouse=True)
def fake_info(monkeypatch):
    calls = []

    def fake(symbol):
        calls.append(symbol)
        return INFO.get(symbol, {"trailingPegRatio": None})

    monkeypatch.setattr(yahoo, "fetch_info", fake)
    return calls


def post(client, **fields):
    body = {"account_id": 3, "trade_date": "2026-10-01", "type": "BUY", "asset": "VOO", "units": 1, "price": 500, **fields}
    return client.post("/api/transactions", json=body)


def error(response) -> str:
    return response.json()["error"]["message"]


def test_buy_is_saved_with_asset_from_yahoo(client, db, fake_info):
    r = post(client, asset="voo", fee=1)
    assert r.status_code == 201
    saved = r.json()["data"]["transaction"]
    assert (saved["asset"], saved["account"], saved["units"], saved["fee"]) == ("VOO", "Gotrade", 1.0, 1.0)
    assert saved["yahoo_rate"] is True and saved["peso_amount"] is None  # no Gotrade deposit yet
    asset = dict(db.execute("SELECT * FROM assets").fetchone())
    assert asset == {"asset": "VOO", "yahoo_symbol": "VOO", "name": "Vanguard S&P 500 ETF", "class": "etf",
                     "region": "United States", "currency": "USD"}

    post(client, units=2)
    assert fake_info == ["VOO"]  # looked up once


def test_alias_and_yahoo_symbol_are_the_same_holding(client):
    post(client, asset="BTC", price=60_000, units=0.01)
    r = post(client, asset="BTC-USD", type="SELL", price=61_000, units=0.01)
    assert r.status_code == 201 and r.json()["data"]["transaction"]["asset"] == "BTC"


def test_deposit_sets_peso_amount_of_later_buys(client):
    assert post(client, type="DEPOSIT", asset="USD", units=100, price=None, php_amount=5_800).status_code == 201
    saved = post(client, units=0.1, fee=1).json()["data"]["transaction"]
    assert saved["deposit_rate"] == pytest.approx(58)
    assert saved["peso_amount"] == pytest.approx(51 * 58) and saved["yahoo_rate"] is False


def test_coins_ph_buy_in_pesos(client):
    saved = post(client, account_id=1, asset="BTC", units=0.001, price=3_500_000, price_currency="PHP", fee=35)
    tx = saved.json()["data"]["transaction"]
    assert tx["peso_amount"] == pytest.approx(3_535) and tx["yahoo_rate"] is False


def test_php_deposit_defaults_its_peso_amount(client):
    tx = post(client, account_id=1, type="DEPOSIT", asset="PHP", units=5_000, price=None).json()["data"]["transaction"]
    assert tx["php_amount"] == 5_000 and tx["price_currency"] == "PHP"


@pytest.mark.parametrize(
    "fields, message",
    [
        ({"type": "DEPOSIT", "asset": "USD", "units": 100}, "pesos you sent"),
        ({"type": "DEPOSIT", "asset": "BTC", "units": 1}, "currency itself"),
        ({"asset": "USD"}, "is cash"),
        ({"price": None}, "price per unit"),
        ({"units": 0}, "more than zero"),
        ({"trade_date": "2099-01-01"}, "future"),
        ({"account_id": 99}, "Unknown account"),
        ({"asset": "NOPE"}, "Yahoo has no data"),
        ({"asset": "7203.T"}, "priced in JPY"),
        ({"asset": "^GSPC"}, "INDEX"),
        ({"asset": "BAD TICKER"}, "Invalid ticker"),
        ({"type": "GIFT"}, "Invalid type"),
        ({"units": -1}, "Invalid units"),
    ],
)
def test_bad_input_is_400_with_a_reason(client, fields, message):
    r = post(client, **fields)
    assert r.status_code == 400
    assert message in error(r)


def test_cannot_sell_more_than_held_and_nothing_is_saved(client, db):
    post(client, units=1)
    r = post(client, type="SELL", units=2, trade_date="2026-10-02")
    assert r.status_code == 400 and "more sold" in error(r)
    assert db.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 1


def test_sell_before_the_buy_date_is_refused(client):
    post(client, units=1, trade_date="2026-10-05")
    assert post(client, type="SELL", units=1, trade_date="2026-10-01").status_code == 400


def test_same_day_buy_then_sell_is_fine(client):
    post(client, units=1)
    assert post(client, type="SELL", units=1).status_code == 201


def test_deleting_a_buy_that_a_sell_needs_is_refused(client):
    buy = post(client, units=1).json()["data"]["transaction"]["id"]
    post(client, type="SELL", units=1, trade_date="2026-10-02")
    r = client.delete(f"/api/transactions/{buy}")
    assert r.status_code == 400
    assert len(client.get("/api/transactions").json()["data"]["transactions"]) == 2


def test_fee_in_another_coin_must_be_held(client):
    r = post(client, account_id=2, asset="BTC", price=60_000, price_currency="USDT", units=0.01, fee=0.001, fee_currency="BNB")
    assert r.status_code == 400 and "BNB" in error(r)
    post(client, account_id=2, asset="BNB", price=600, price_currency="USDT", units=0.5, trade_date="2026-09-01")
    r = post(client, account_id=2, asset="BTC", price=60_000, price_currency="USDT", units=0.01, fee=0.001, fee_currency="bnb")
    assert r.status_code == 201 and r.json()["data"]["transaction"]["fee_currency"] == "BNB"


def test_fee_in_trade_currency_is_stored_as_null(client):
    tx = post(client, fee=1, fee_currency="USD").json()["data"]["transaction"]
    assert tx["fee_currency"] is None


def test_transfer_fee_is_in_the_coin(client):
    post(client, asset="BTC", price=60_000, units=0.01)
    tx = post(client, type="TRANSFER", asset="BTC", units=0.01, fee=0.0001, price=None).json()["data"]["transaction"]
    assert tx["fee_currency"] == "BTC" and tx["price"] is None


def test_edit_and_delete(client):
    tx_id = post(client, units=1).json()["data"]["transaction"]["id"]
    r = client.put(f"/api/transactions/{tx_id}", json={
        "account_id": 3, "trade_date": "2026-10-03", "type": "BUY", "asset": "VOO", "units": 2, "price": 490, "note": "top-up"})
    assert r.status_code == 200
    tx = r.json()["data"]["transaction"]
    assert (tx["units"], tx["price"], tx["trade_date"], tx["note"]) == (2.0, 490.0, "2026-10-03", "top-up")
    assert client.delete(f"/api/transactions/{tx_id}").status_code == 200
    assert client.get("/api/transactions").json()["data"]["transactions"] == []
    assert client.delete(f"/api/transactions/{tx_id}").status_code == 404
    assert client.put(f"/api/transactions/{tx_id}", json={
        "account_id": 3, "trade_date": "2026-10-03", "type": "BUY", "asset": "VOO", "units": 2, "price": 490}).status_code == 404


def test_list_is_newest_first_and_exports_csv(client):
    post(client, trade_date="2026-09-01")
    post(client, trade_date="2026-10-01", asset="NVDA", price=180)
    rows = client.get("/api/transactions").json()["data"]["transactions"]
    assert [r["asset"] for r in rows] == ["NVDA", "VOO"]
    csv = client.get("/api/transactions?format=csv")
    assert csv.headers["content-type"].startswith("text/csv")
    lines = csv.text.strip().splitlines()
    assert lines[0].startswith("id,trade_date,account_id,account,type,asset") and len(lines) == 3


def test_accounts_with_deposits_and_cash(client):
    post(client, type="DEPOSIT", asset="USD", units=100, price=None, php_amount=5_800, trade_date="2026-09-01")
    post(client, type="DEPOSIT", asset="USD", units=100, price=None, php_amount=6_000)
    assert client.put("/api/accounts/1/cash", json={"currency": "PHP", "amount": 1_200}).status_code == 200
    assert client.put("/api/accounts/1/cash", json={"currency": "PHP", "amount": 1_500}).status_code == 200
    accounts = {a["name"]: a for a in client.get("/api/accounts").json()["data"]["accounts"]}
    assert accounts["Gotrade"]["avg_rate"] == pytest.approx(59)
    assert accounts["Gotrade"]["deposited_php"] == 11_800
    assert accounts["Coins.ph"]["cash"] == [{"currency": "PHP", "amount": 1_500}]
    assert accounts["Binance"]["avg_rate"] is None

    assert client.put("/api/accounts/9/cash", json={"currency": "PHP", "amount": 1}).status_code == 400
    assert client.put("/api/accounts/1/cash", json={"currency": "EUR", "amount": 1}).status_code == 400
    csv = client.get("/api/accounts?format=csv").text.splitlines()
    assert "cash_php" in csv[0] and len(csv) == 5
