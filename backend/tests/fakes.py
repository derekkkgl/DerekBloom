"""Yahoo profile fields for the tickers tests use, as yahoo.fetch_info would return them."""

INFO = {
    "BTC-USD": {"regularMarketPrice": 60_000.0, "shortName": "Bitcoin USD", "quoteType": "CRYPTOCURRENCY", "currency": "USD"},
    "BNB-USD": {"regularMarketPrice": 600.0, "shortName": "BNB USD", "quoteType": "CRYPTOCURRENCY", "currency": "USD"},
    "VOO": {"regularMarketPrice": 500.0, "shortName": "Vanguard S&P 500 ETF", "quoteType": "ETF", "currency": "USD"},
    "NVDA": {"regularMarketPrice": 180.0, "shortName": "NVIDIA", "quoteType": "EQUITY", "currency": "USD"},
    "7203.T": {"regularMarketPrice": 2_900.0, "shortName": "Toyota", "quoteType": "EQUITY", "currency": "JPY"},
    "^GSPC": {"regularMarketPrice": 6_000.0, "shortName": "S&P 500", "quoteType": "INDEX", "currency": "USD"},
    "ETH-USD": {"regularMarketPrice": 3_000.0, "shortName": "Ethereum USD", "quoteType": "CRYPTOCURRENCY", "currency": "USD"},
    "DELISTED": {"regularMarketPrice": 1.0, "shortName": "Gone Inc", "quoteType": "EQUITY", "currency": "USD"},
}
