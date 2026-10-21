from datetime import date

import pytest

from app.services.costbasis import Tx, replay

GOTRADE, BINANCE, COINS, MANUAL = 3, 2, 1, 4


class FakePrices:
    """USD/PHP is 58 until Oct 1, then 60. Coin closes come from a small dict."""

    def __init__(self, closes: dict[tuple[str, date], float] | None = None):
        self.closes = closes or {}

    def usd_php(self, day: date) -> float:
        return 58.0 if day < date(2026, 10, 1) else 60.0

    def usd_close(self, asset: str, day: date) -> float | None:
        return self.closes.get((asset, day))


_next_id = iter(range(1, 10_000))


def tx(type_: str, asset: str, units: float, day: str, account: int = GOTRADE, price: float | None = None,
       currency: str = "USD", fee: float = 0.0, fee_currency: str | None = None, php: float | None = None) -> Tx:
    return Tx(next(_next_id), account, date.fromisoformat(day), type_, asset, units, price, currency, fee, fee_currency, php)


def test_dollar_buy_uses_yahoos_rate_on_the_trade_date():
    book = replay(
        [
            tx("BUY", "VOO", 0.1, "2026-01-20", price=500, fee=1),  # 51 USD at 58
            tx("BUY", "VOO", 0.1, "2026-10-02", price=500),  # 50 USD at 60
        ],
        FakePrices(),
    )
    voo = book.positions["VOO"]
    assert voo.units == pytest.approx(0.2)
    assert voo.cost_usd == pytest.approx(101)
    assert voo.cost_php == pytest.approx(51 * 58 + 50 * 60)


def test_deposits_do_not_change_peso_cost():
    with_deposit = replay([tx("DEPOSIT", "USD", 100, "2026-01-05", php=6_500), tx("BUY", "VOO", 0.1, "2026-01-20", price=500)], FakePrices())
    assert with_deposit.positions["VOO"].cost_php == pytest.approx(50 * 58)


def test_coins_ph_buy_is_priced_in_pesos():
    book = replay([tx("BUY", "BTC", 0.001, "2026-10-02", account=COINS, price=3_500_000, currency="PHP", fee=35)],
                  FakePrices())
    btc = book.positions["BTC"]
    assert btc.cost_php == pytest.approx(3_535)
    assert btc.cost_usd == pytest.approx(3_535 / 60)  # that day's rate, for USD mode


def test_partial_sell_at_average_cost_books_realized_pnl():
    book = replay(
        [
            tx("BUY", "AAPL", 1, "2026-01-10", price=100),
            tx("BUY", "AAPL", 1, "2026-02-10", price=100),
            tx("SELL", "AAPL", 0.5, "2026-10-05", price=150, fee=1),  # proceeds 74 USD at Yahoo's 60
        ],
        FakePrices(),
    )
    aapl = book.positions["AAPL"]
    assert aapl.units == pytest.approx(1.5)
    assert (aapl.cost_usd, aapl.cost_php) == (pytest.approx(150), pytest.approx(8_700))
    assert aapl.realized_usd == pytest.approx(74 - 50)
    assert aapl.realized_php == pytest.approx(74 * 60 - 2_900)


def test_selling_everything_clears_the_cost():
    book = replay([tx("BUY", "ETH", 0.3, "2026-01-10", price=3000), tx("SELL", "ETH", 0.1, "2026-02-10", price=3000),
                   tx("SELL", "ETH", 0.2, "2026-03-10", price=3000)], FakePrices())
    eth = book.positions["ETH"]
    assert (eth.units, eth.cost_php, eth.cost_usd) == (0.0, 0.0, 0.0)


def test_fee_in_another_coin_raises_cost_and_spends_that_coin():
    prices = FakePrices({("BNB", date(2026, 10, 2)): 600.0})
    book = replay(
        [
            tx("BUY", "BNB", 1, "2026-01-02", account=BINANCE, price=500, currency="USDT"),
            tx("BUY", "ETH", 0.1, "2026-10-02", account=BINANCE, price=3000, currency="USDT", fee=0.002, fee_currency="BNB"),
        ],
        prices,
    )
    eth, bnb = book.positions["ETH"], book.positions["BNB"]
    assert eth.cost_usd == pytest.approx(301.2)  # 0.002 BNB x 600
    assert eth.cost_php == pytest.approx(301.2 * 60)
    assert bnb.units == pytest.approx(0.998)
    assert bnb.cost_usd == pytest.approx(499)
    assert bnb.realized_usd == pytest.approx(1.2 - 1)


def test_unpriced_fee_coin_is_a_warning_not_a_crash():
    book = replay([tx("BUY", "BNB", 1, "2026-01-02", price=500),
                   tx("BUY", "ETH", 0.1, "2026-10-02", price=3000, fee=0.002, fee_currency="BNB")], FakePrices())
    assert book.positions["ETH"].cost_usd == pytest.approx(300)
    assert "BNB" in book.warnings[0]


def test_fee_in_the_coin_bought_reduces_units():
    book = replay([tx("BUY", "BTC", 0.01, "2026-10-02", account=BINANCE, price=60_000, currency="USDT",
                      fee=0.00001, fee_currency="BTC")], FakePrices())
    btc = book.positions["BTC"]
    assert btc.units == pytest.approx(0.00999) and btc.cost_usd == pytest.approx(600)


def test_fee_in_pesos_on_a_dollar_buy_is_converted():
    book = replay([tx("BUY", "VOO", 1, "2026-10-02", price=500, fee=60, fee_currency="PHP")], FakePrices())
    assert book.positions["VOO"].cost_usd == pytest.approx(501)


def test_reward_adds_units_at_zero_cost():
    book = replay([tx("BUY", "ETH", 1, "2026-01-10", price=3000), tx("REWARD", "ETH", 0.05, "2026-02-10")],
                  FakePrices())
    eth = book.positions["ETH"]
    assert eth.units == pytest.approx(1.05) and eth.cost_usd == pytest.approx(3000)


def test_transfer_fee_leaves_but_cost_stays():
    book = replay([tx("BUY", "BTC", 0.01, "2026-01-10", price=60_000),
                   tx("TRANSFER", "BTC", 0.01, "2026-02-10", fee=0.0005, fee_currency="BTC")], FakePrices())
    btc = book.positions["BTC"]
    assert btc.units == pytest.approx(0.0095) and btc.cost_usd == pytest.approx(600)


def test_dividend_is_income_at_that_days_rate():
    book = replay([tx("BUY", "VOO", 1, "2026-01-10", price=500), tx("DIVIDEND", "VOO", 1.5, "2026-10-05")],
                  FakePrices())
    voo = book.positions["VOO"]
    assert voo.dividends_usd == pytest.approx(1.5) and voo.dividends_php == pytest.approx(90)
    assert voo.units == 1


def test_deposits_and_withdrawals_do_not_create_holdings():
    book = replay([tx("DEPOSIT", "USD", 100, "2026-01-05", php=5_800), tx("WITHDRAW", "USD", 50, "2026-02-05")],
                  FakePrices())
    assert book.positions == {}


def test_buy_without_a_price_keeps_units_but_has_no_cost():
    book = replay([tx("BUY", "BTC", 0.002, "2026-01-10", price=60_000), tx("BUY", "BTC", 0.001, "2026-02-10")], FakePrices())
    btc = book.positions["BTC"]
    assert btc.units == pytest.approx(0.003) and btc.cost_known is False


def test_sells_book_no_pnl_without_a_price_or_a_known_cost():
    book = replay([tx("BUY", "ETH", 1, "2026-01-10", price=3_000), tx("SELL", "ETH", 0.5, "2026-02-10"),
                   tx("BUY", "XRP", 10, "2026-01-10"), tx("SELL", "XRP", 5, "2026-02-10", price=2)], FakePrices())
    eth, xrp = book.positions["ETH"], book.positions["XRP"]
    assert eth.units == pytest.approx(0.5) and eth.cost_usd == pytest.approx(1_500) and eth.realized_usd == 0
    assert xrp.units == pytest.approx(5) and xrp.realized_usd == 0 and xrp.cost_known is False


def test_selling_everything_starts_a_fresh_known_cost():
    book = replay([tx("BUY", "ETH", 1, "2026-01-10"), tx("SELL", "ETH", 1, "2026-02-10"),
                   tx("BUY", "ETH", 1, "2026-03-10", price=3_000)], FakePrices())
    eth = book.positions["ETH"]
    assert eth.cost_known is True and eth.cost_usd == pytest.approx(3_000)
