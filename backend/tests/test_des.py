import pytest

from app.core.cache import cache
from app.core.errors import UpstreamError
from app.services import coingecko, yahoo

NVDA_INFO = {
    "longName": "NVIDIA Corporation",
    "quoteType": "EQUITY",
    "currency": "USD",
    "fullExchangeName": "NasdaqGS",
    "sector": "Technology",
    "industry": "Semiconductors",
    "country": "United States",
    "fullTimeEmployees": 42000,
    "longBusinessSummary": "NVIDIA designs chips.",
    "regularMarketPrice": 200.0,
    "marketCap": 5.0e12,
    "beta": 2.2,
    "fiftyTwoWeekLow": 150.0,
    "fiftyTwoWeekHigh": float("nan"),
    "trailingPE": 27.4,
    "forwardPE": None,
    "dividendRate": 1.0,
    "dividendYield": 0.46,  # ignored: we compute yield ourselves
    "exDividendDate": 1788998400,  # 2026-09-10
}

VOO_INFO = {
    "longName": "Vanguard S&P 500 ETF",
    "quoteType": "ETF",
    "currency": "USD",
    "regularMarketPrice": 700.0,
    "beta3Year": 1.0,
    "trailingAnnualDividendRate": 7.0,
    "fundFamily": "Vanguard",
    "category": "Large Blend",
    "netAssets": 1.7e12,
    "netExpenseRatio": 0.03,
}


@pytest.fixture
def fake_info(monkeypatch):
    calls = []

    def fake(symbol):
        calls.append(symbol)
        return {"NVDA": NVDA_INFO, "VOO": VOO_INFO}.get(symbol, {"trailingPegRatio": None})

    monkeypatch.setattr(yahoo, "fetch_info", fake)
    return calls


def test_stock_des(client, fake_info):
    body = client.get("/api/des/nvda").json()
    data = body["data"]
    assert (data["kind"], data["input"], data["symbol"], data["type"]) == ("security", "NVDA", "NVDA", "EQUITY")
    assert data["sector"] == "Technology" and data["employees"] == 42000
    assert data["dividend_yield_pct"] == pytest.approx(0.5)  # 1.0 / 200 * 100, not Yahoo's 0.46
    assert data["ex_dividend_date"] == "2026-09-10"
    assert data["year_high"] is None and data["pe_forward"] is None
    assert data["fund"] is None
    assert body["meta"]["source"] == "yahoo"


def test_etf_des_has_fund_facts_and_trailing_dividend(client, fake_info):
    data = client.get("/api/des/VOO").json()["data"]
    assert data["fund"] == {"family": "Vanguard", "category": "Large Blend", "total_assets": 1.7e12, "expense_ratio_pct": 0.03}
    assert data["beta"] == 1.0
    assert data["dividend_rate"] == 7.0 and data["dividend_yield_pct"] == pytest.approx(1.0)
    assert data["sector"] is None and data["ex_dividend_date"] is None


def test_profile_is_cached(client, fake_info):
    client.get("/api/des/NVDA")
    assert client.get("/api/des/NVDA").json()["meta"]["cached"] is True
    assert fake_info == ["NVDA"]


def test_unknown_ticker_is_404(client, fake_info):
    res = client.get("/api/des/ZZZZNOTREAL")
    assert res.status_code == 404
    assert "ZZZZNOTREAL" in res.json()["error"]["message"]


def test_bad_ticker_is_400(client, fake_info):
    assert client.get("/api/des/BAD$").status_code == 400


# --- Coins -------------------------------------------------------------------

ETH_RAW = {
    "id": "ethereum",
    "symbol": "eth",
    "name": "Ethereum",
    "market_cap_rank": 2,
    "categories": ["Smart Contract Platform", "", "Layer 1 (L1)", "Ethereum Ecosystem", "FTX Holdings"],
    "description": {"en": 'Ethereum is a <a href="x">platform</a> &amp; more.\r\n\r\nSecond paragraph.'},
    "genesis_date": "2015-07-30",
    "links": {
        "homepage": ["", "https://ethereum.org/"],
        "whitepaper": "",
        "blockchain_site": ["https://etherscan.io/", "https://ethplorer.io/"],
        "repos_url": {"github": ["https://github.com/ethereum/go-ethereum"]},
    },
    "market_data": {
        "current_price": {"usd": 2000.0, "php": 120000.0},
        "ath": {"usd": 5000.0, "php": 240000.0},
        "ath_date": {"usd": "2025-08-24T11:21:03.000Z", "php": "2025-08-24T11:21:03.000Z"},
        "fully_diluted_valuation": {"usd": 3.0e11},
        "circulating_supply": 122_000_000.0,
        "total_supply": 122_000_000.0,
        "max_supply": None,
        "total_volume": {"usd": 1.0e10},
    },
}

MARKET_ROW = {
    "id": "ethereum", "price_usd": 2500.0, "price_php": 150000.0, "change_24h_pct": 1.5, "change_24h_pct_php": 1.7,
    "volume_usd": 2.0e10, "volume_php": 1.2e12, "market_cap_usd": 3.0e11, "market_cap_php": 1.8e13,
}


@pytest.fixture
def fake_coin(monkeypatch):
    state = {"coin_calls": 0, "markets_calls": 0, "markets": [MARKET_ROW], "markets_fail": None, "coin_fail": None}

    def coin(coin_id):
        state["coin_calls"] += 1
        if state["coin_fail"]:
            raise state["coin_fail"]
        return ETH_RAW

    def markets():
        state["markets_calls"] += 1
        if state["markets_fail"]:
            raise state["markets_fail"]
        return state["markets"]

    monkeypatch.setattr(coingecko, "fetch_coin", coin)
    monkeypatch.setattr(coingecko, "get_markets", markets)
    return state


def test_shape_coin():
    data = coingecko.shape_coin(ETH_RAW)
    assert (data["symbol"], data["rank"]) == ("ETH", 2)
    assert data["categories"] == ["Smart Contract Platform", "Layer 1 (L1)", "Ethereum Ecosystem"]
    assert data["summary"] == "Ethereum is a platform & more."
    assert data["links"] == {
        "homepage": "https://ethereum.org/",
        "whitepaper": None,
        "explorer": "https://etherscan.io/",
        "source": "https://github.com/ethereum/go-ethereum",
    }
    assert data["max_supply"] is None and data["fdv_php"] is None
    assert data["ath_usd"] == 5000.0


def test_long_summary_is_cut_at_a_word():
    text = coingecko.first_paragraph("word " * 400)
    assert len(text) <= coingecko.SUMMARY_CHARS + 1 and text.endswith("word…")
    assert coingecko.first_paragraph(None) is None
    assert coingecko.first_paragraph("\r\n\r\n<p></p>\r\n\r\nReal text") == "Real text"


def test_coin_des_uses_live_price_and_measures_from_ath(client, fake_coin):
    body = client.get("/api/des/eth").json()
    data = body["data"]
    assert (data["kind"], data["input"], data["id"]) == ("coin", "ETH", "ethereum")
    assert (data["price_usd"], data["price_php"], data["change_24h_pct_php"]) == (2500.0, 150000.0, 1.7)
    assert data["from_ath_pct_usd"] == pytest.approx(-50.0)
    assert data["from_ath_pct_php"] == pytest.approx(-37.5)
    assert data["circulating_supply"] == 122_000_000.0
    assert body["meta"]["source"] == "coingecko"


def test_new_high_since_profile_fetch_resets_ath(client, fake_coin):
    fake_coin["markets"] = [{**MARKET_ROW, "price_usd": 6000.0}]
    data = client.get("/api/des/ETH").json()["data"]
    assert (data["ath_usd"], data["ath_date_usd"], data["from_ath_pct_usd"]) == (6000.0, None, 0.0)
    assert data["ath_php"] == 240000.0  # the PHP high still stands


def test_coin_outside_market_list_falls_back_to_profile_price(client, fake_coin):
    fake_coin["markets"] = []
    data = client.get("/api/des/ETH").json()["data"]
    assert data["price_usd"] == 2000.0 and data["from_ath_pct_usd"] == pytest.approx(-60.0)


def test_market_list_down_still_serves_profile(client, fake_coin):
    fake_coin["markets_fail"] = UpstreamError("CoinGecko rate limit reached (HTTP 429). Try again in a minute.")
    res = client.get("/api/des/ETH")
    assert res.status_code == 200
    assert res.json()["data"]["price_usd"] == 2000.0


def test_profile_cached_six_hours_and_stale_on_429(client, fake_coin):
    client.get("/api/des/ETH")
    client.get("/api/des/ETH")
    assert fake_coin["coin_calls"] == 1

    entry = cache._entries["coin:ethereum"]
    cache._entries["coin:ethereum"] = type(entry)(entry.value, entry.fetched_at - 7 * 3600)
    fake_coin["coin_fail"] = UpstreamError("CoinGecko rate limit reached (HTTP 429). Try again in a minute.")
    body = client.get("/api/des/ETH").json()
    assert body["meta"]["stale"] is True
    assert body["data"]["name"] == "Ethereum"


def test_coin_profile_429_with_nothing_cached_is_502(client, fake_coin):
    fake_coin["coin_fail"] = UpstreamError("CoinGecko rate limit reached (HTTP 429). Try again in a minute.")
    res = client.get("/api/des/BTC")
    assert res.status_code == 502
    assert "429" in res.json()["error"]["message"]
