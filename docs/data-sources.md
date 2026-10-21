# Data sources

Free sources only. Each entry says what it covers, its limits, how reliable it has been, and when it was last checked.

## Yahoo Finance (via `yfinance` 1.7.0)

- **Used by:** `/api/quote`, `/api/quotes`, `/api/chart`, `/api/wei`, `/api/des` (stocks and ETFs), `/api/portfolio`, `/api/yield`, `/api/goal`, and asset lookups when you add a transaction
- **Coverage:** US and international stocks and ETFs (Yahoo suffixes: `7203.T`, `0700.HK`, `ASML.AS`, `D05.SI`), global indices (`^GSPC`, `^N225` ...), FX (`PHP=X` = USD/PHP), futures (`GC=F`, `CL=F`), the dollar index (`DX-Y.NYB`), US 10Y yield (`^TNX`), and crypto price history (`BTC-USD`).
- **Limits:** unofficial, no API key, and Yahoo rate-limits heavy use (`YFRateLimitError` → we return 502 or the stale copy). Intraday history only goes back so far: 1m bars about 7 days, 5m–30m about 60 days, 1h about 730 days. Some international index quotes are delayed.
- **Quirks found:**
  - In yfinance 1.7, `Ticker.fast_info` returns `None` for every field, so quotes use `Ticker.info` instead (one request, includes the name).
  - An unknown ticker doesn't raise. `.info` returns `{"trailingPegRatio": None}` and history comes back empty, so we treat "no price and no name" as 404.
  - A batch `yf.download` across exchanges has NaN on days a given market was closed, so WEI takes each symbol's last non-NaN close.
  - `/api/quotes` uses one `yf.download` for the whole list (about 45 days of daily bars), so a list of 8 tickers is one request. A ticker Yahoo doesn't know comes back as an all-NaN column and shows as nulls.
  - Profile fields (`Ticker.info`, used by DES, checked on NVDA, VOO, QQQ, 7203.T): `dividendYield` is in percent in yfinance 1.7 (`0.46` means 0.46%) but has been a fraction in older versions, so DES computes yield itself as `dividendRate / price × 100` (falling back to `trailingAnnualDividendRate`, which is all ETFs have). `netExpenseRatio` is already in percent (`0.03` = 0.03%). `exDividendDate` is Unix seconds. ETFs have no `sector`, `marketCap`, `beta`, `forwardPE`, `priceToSalesTrailing12Months`, or `enterpriseToEbitda`; they have `beta3Year`, `fundFamily`, `category`, `totalAssets`/`netAssets`, and `trailingPE`. Toyota (`7203.T`) has full stock fields in JPY.
  - GP in pesos (`/api/chart?currency=PHP`) converts every bar at the USD/PHP close of its own bar from `PHP=X` history: daily bars by trading date, intraday bars by time (5-minute FX bars exist, fetched over a longer window so weekend crypto bars use Friday's last rate). `PHP=X` monthly history starts Dec 2003, so earlier bars are dropped from a peso chart rather than guessed. Only USD prices convert; indices (points), exchange rates, and non-USD listings stay native with a note.
  - Close times for daily, weekly, and monthly bars come from the chart metadata: `exchangeTimezoneName` and `currentTradingPeriod.regular.end` (16:00 New York, 15:30 Tokyo; 24-hour markets such as crypto and futures report 23:59, read as the end of the day). There is no holiday calendar, so a week is assumed to close on Friday. `regularMarketTime` is the last trade.
  - Prices often arrive with float32 noise (e.g. `7712.56982421875`). We pass them through unchanged, and the frontend formatter rounds for display.
  - Portfolio pricing (`/api/portfolio`, `/api/yield`, `/api/goal`) is one `yf.download(..., actions=True)` for every asset you hold plus `PHP=X`, from your earliest trade date (or 13 months back, whichever is earlier), cached 60 seconds. `actions=True` adds a `Dividends` column per ticker (the cash paid per share on the ex-date; crypto and `PHP=X` are all zeros). Checked on VOO: 4 payments in the last 12 months, 1.77 to 1.96 USD each. Batch daily bars come with a timezone-free date index, so a trade date matches the close of the same calendar day.
  - A value in pesos uses today's last `PHP=X` close. A coin bought on Coins.ph is valued at Yahoo's USD price × USD/PHP, not Coins.ph's own peso price, so it can differ from the Coins.ph app by the exchange's spread.
  - The portfolio holds USD-priced listings only (US stocks and ETFs, and crypto as `XXX-USD`). A ticker Yahoo prices in another currency (`7203.T` in JPY) is refused with a message until non-USD conversion is added. Coins without a short name in `app/core/tickers.py` are entered by their Yahoo symbol (`LINK-USD`).
- **Reliability:** all 23 WEI symbols and the 7 Phase 1 test tickers returned data.
- **Last checked:** 2026-10-21

## CoinGecko public API (no key)

- **Used by:** `/api/crypto/markets`, `/api/crypto/global`, `/api/des` (coins)
- **Endpoints:** `GET https://api.coingecko.com/api/v3/coins/markets`, called twice (`vs_currency=usd` and `vs_currency=php`, both with a sparkline) and joined by coin id. The PHP call supplies peso prices, peso % changes, peso volume, and the peso sparkline. `GET /global` for total market cap and volume (in every currency, including PHP) and dominance by coin, cached 5 minutes. `GET /coins/{id}?localization=false&tickers=false&community_data=false&developer_data=false` for a coin's profile (description, categories, links, circulating/total/max supply, fully diluted value, all-time high and its date, each in USD and PHP), cached 6 hours.
- **Coin DES:** the profile is cached 6 hours; the live price comes from the cached `/coins/markets` list (2 minutes), so opening a coin's DES costs at most one extra call every 6 hours. A coin outside the top 100 shows the profile's own price, which can be up to 6 hours old (the panel's time says so). The description's first paragraph is shown as plain text, cut at about 800 characters.
- **Coverage:** top 100 coins by market cap. Price, 1h/24h/7d change, volume, market cap, 7-day hourly sparkline (168 points). Prices in PHP come directly from CoinGecko.
- **Limits:** the keyless tier is tightly rate-limited and throttles with HTTP 429. We cache 2 minutes and serve the last good copy on failure. A free Demo key (higher limit) can be added later if throttling becomes a problem.
- **Note:** CoinGecko's PHP prices use its own FX rate. On 2026-10-21 it implied USD/PHP 63.46 vs Yahoo's 63.38 (about 0.13% apart).
- **Reliability:** both market calls returned 100 coins; `/coins/ethereum` returned every DES field (ETH has no max supply, which shows as —).
- **Last checked:** 2026-10-21

## RSS news feeds (`requests` + `feedparser`)

- **Used by:** `/api/news`
- **Feeds:**

  | Name | Category | URL |
  | --- | --- | --- |
  | CNBC Top News | markets | `https://www.cnbc.com/id/100003114/device/rss/rss.html` |
  | MarketWatch Top Stories | markets | `https://feeds.content.dowjones.io/public/rss/mw_topstories` |
  | CoinDesk | crypto | `https://www.coindesk.com/arc/outboundfeeds/rss/` |
  | Cointelegraph | crypto | `https://cointelegraph.com/rss` |
  | Decrypt | crypto | `https://decrypt.co/feed` |

- **robots.txt:** checked for each host. CNBC's older feed host `search.cnbc.com` disallows all agents, so we use the same feed on `www.cnbc.com`, whose robots.txt has no general block. CoinDesk's general rules allow `/arc/outboundfeeds/`. Its `Disallow: /` lines target AI crawlers (GPTBot, ClaudeBot ...), not RSS readers.
- **Limits:** each feed is fetched at most once per 5 minutes, with a 10 s timeout and an honest User-Agent (`DailyTape/0.1 (personal RSS reader)`). Headlines and short summaries only. We link to the article and never copy full text.
- **Reliability:** all five feeds returned 10–38 items.
- **Last checked:** 2026-10-21

## Planned (later phases)

alternative.me Fear & Greed (Phase 5), DefiLlama (Phase 5), FRED (Phase 5, needs a free key in `.env`), Philippine sources (Phase 9, researched then).
