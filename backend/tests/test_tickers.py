import pytest

from app.core.errors import BadRequest
from app.core.tickers import alias_for_coin, resolve


@pytest.mark.parametrize(
    "raw, symbol, coingecko_id",
    [
        ("BTC", "BTC-USD", "bitcoin"),
        ("eth", "ETH-USD", "ethereum"),
        (" xrp ", "XRP-USD", "ripple"),
        ("BTC-USD", "BTC-USD", "bitcoin"),
        ("USDPHP", "PHP=X", None),
        ("php=x", "PHP=X", None),
        ("nvda", "NVDA", None),
        ("7203.T", "7203.T", None),
        ("0700.hk", "0700.HK", None),
        ("^GSPC", "^GSPC", None),
        ("BRK-B", "BRK-B", None),
    ],
)
def test_resolve(raw, symbol, coingecko_id):
    t = resolve(raw)
    assert (t.symbol, t.coingecko_id) == (symbol, coingecko_id)
    assert t.input == raw.strip().upper()


@pytest.mark.parametrize("raw", ["", "NVDA$", "AAPL MSFT", "../etc", "A" * 21, "ÄPPL", "BTC;DROP"])
def test_rejects_invalid(raw):
    with pytest.raises(BadRequest):
        resolve(raw)


def test_alias_for_coin():
    assert alias_for_coin("bitcoin") == "BTC"
    assert alias_for_coin("ripple") == "XRP"
    assert alias_for_coin("some-new-coin") is None
    assert alias_for_coin(None) is None
