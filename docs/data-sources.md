# Data sources

Free sources only. Each entry says what it covers, its limits, how reliable it has been, and when it was last checked.

## Yahoo Finance (via `yfinance` 1.7.0)

- **Used by:** `/api/quote`, `/api/quotes`, `/api/chart`, `/api/wei`, `/api/des` (stocks and ETFs), `/api/portfolio`, `/api/yield`, `/api/goal`, asset lookups when you add a transaction, the USD/PHP rate (`PHP=X`, cached 5 minutes) for dollar totals in pesos, and Phase 5b's world screens: `/api/screen/*` (MOST, MOV), `/api/fx`, `/api/commodities`, `/api/imap`, `/api/wmap`
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
  - **Screeners (MOST, MOV, Phase 5b):** `yf.screen("most_actives" | "day_gainers" | "day_losers", count=25)`, one request each (cached 2 minutes). US listings only. Yahoo's own filters: most actives = market cap ≥ $2B and over 5M shares traded; gainers = up over 3%, losers = down over 2.5%, both with market cap ≥ $2B and price ≥ $5. Early in the New York session few stocks pass the 5M-share filter (12 at 9:41 a.m. on 2026-10-21, 348 the evening before), so the list fills up during the day. Yahoo picks the movers from slightly older numbers than the quotes it returns (on 2026-10-21 the losers list held a stock at −2.33% and its order didn't match the % shown), so we re-sort gainers and losers by the change shown. Most actives keep Yahoo's order (by volume).
  - **FX (Phase 5b):** one `yf.download` of `EURUSD=X GBPUSD=X AUDUSD=X JPY=X CHF=X CAD=X CNY=X SGD=X PHP=X DX-Y.NYB` (cached 60 s). Quote directions differ: `EURUSD=X`, `GBPUSD=X`, `AUDUSD=X` are dollars per unit; `JPY=X`, `CHF=X`, `CAD=X`, `CNY=X`, `SGD=X`, `PHP=X` are units per dollar. We turn every currency into "dollars per unit" first, so a plus always means that currency got stronger, and cross rates are one division. Cross rates mix each pair's latest close, so markets that last traded at different times are mixed. Yahoo mid quotes: no bank or remittance spread. Yahoo also has direct peso pairs (`EURPHP=X`), which FX rows link to for charts.
  - **Futures (CMDTY, Phase 5b):** `GC=F SI=F CL=F NG=F HG=F ZW=F` in one download from last December (for YTD). These are front-month contracts, so a roll to the next contract can look like a jump. Futures have NaN gap days in a batch download (on 2026-10-21, `CL=F`, `GC=F`, and `HG=F` had no bar for 10-20), so each takes its last real close. Wheat (`ZW=F`) is quoted in US cents per bushel (630.5 = $6.305); we divide by 100.
  - **IMAP (Phase 5b):** day moves for the 11 SPDR sector ETFs, 6 world ETFs, and your Home list come from one `yf.download` (60 s). Sector weights are SPY's `funds_data.sector_weightings` (fractions, e.g. `technology: 0.4045`; keys mapped to XLK, XLF ... in `app/core/world.py`), cached a day. Fund size is `.info["totalAssets"]` (ETFs) or `marketCap` (stocks, coins), one request per symbol (about 0.5 s each, run 8 at a time), cached a day; only USD sizes are used so a map never mixes currencies. Vanguard reports `totalAssets` for the whole fund including its mutual-fund share classes: VXUS showed $649B and VOO $1.73T on 2026-10-21, against VT's $101B, so Vanguard tiles look bigger than the ETF alone.
  - **WMAP (Phase 5b):** 24 national indices in one download from last December. Added beyond WEI: `^MXX`, `^BVSP`, `^AEX`, `^SSMI`, `^IBEX`, `FTSEMIB.MI`, `^J203.JO`, `^TWII`, `^KLSE`, `PSEI.PS`, `^JKSE`, `^NZ50`. **`PSEI.PS` (the PSEi) has only today's close on Yahoo, no history** (checked 2026-10-21; `^PSEI` doesn't exist), so its tile shows the level with no change or YTD. Thailand's `^SET.BK` has the same gaps and was left off. `^MERV` (Argentina) and `^IPSA` (Chile) returned no data.
- **Reliability:** all 23 WEI symbols and the 7 Phase 1 test tickers returned data. Phase 5b: all three screeners, every FX pair and future, all 17 IMAP ETFs, SPY's sector weights, and 23 of 24 WMAP indices with a day change (all but the PSEi) returned data on 2026-10-21; each endpoint answers in under 1.5 s, IMAP in about 3 s on its first load of the day.
- **Last checked:** 2026-10-21

## CoinGecko public API (no key)

- **Used by:** `/api/crypto/markets`, `/api/crypto/global`, `/api/crypto/movers`, `/api/crypto/trending`, `/api/crypto/sectors`, `/api/des` (coins)
- **Endpoints:** `GET https://api.coingecko.com/api/v3/coins/markets?per_page=200`, called twice (`vs_currency=usd` and `vs_currency=php`, both with a sparkline) and joined by coin id. This one download (cached 2 minutes) feeds CRYPTO (the first 100), XMOV (movers among all 200), Home, coin DES, and the coin symbols in XSEC. The PHP call supplies peso prices, peso % changes, peso volume, and the peso sparkline. `GET /global` for total market cap and volume (in every currency, including PHP) and dominance by coin, cached 5 minutes. `GET /coins/{id}?localization=false&tickers=false&community_data=false&developer_data=false` for a coin's profile (description, categories, links, circulating/total/max supply, fully diluted value, all-time high and its date, each in USD and PHP), cached 6 hours.
- **Coin DES:** the profile is cached 6 hours; the live price comes from the cached `/coins/markets` list (2 minutes), so opening a coin's DES costs at most one extra call every 6 hours. A coin outside the top 100 shows the profile's own price, which can be up to 6 hours old (the panel's time says so). The description's first paragraph is shown as plain text, cut at about 800 characters.
- **More endpoints (Phase 5a):** `GET /search/trending` (the 15 most-searched coins in 24 hours; price in USD only, market cap as display text like `"$20,307,092"`, 24h change in every currency), cached 10 minutes. `GET /coins/categories` (about 775 categories with market cap, 24h market-cap change, 24h volume, and the ids of the 3 biggest coins), cached 10 minutes. Categories overlap and include investor portfolios ("Made in USA", "World Liberty Financial Portfolio"), so XSEC's heat map uses a fixed list of 23 real sectors (`SECTORS` in `app/services/coingecko.py`); all 23 ids existed on 2026-10-21. A category's only change figure is 24 hours, in dollars.
- **Coverage:** top 200 coins by market cap (the CRYPTO board shows 100). Price, 1h/24h/7d change, volume, market cap, 7-day hourly sparkline (168 points). Prices in PHP come directly from CoinGecko.
- **Limits:** the keyless tier is tightly rate-limited and throttles with HTTP 429. We cache 2 minutes and serve the last good copy on failure. A free Demo key (higher limit) can be added later if throttling becomes a problem. In steady use the app makes about 1.5 calls a minute. Bursts can still hit 429: on 2026-10-21, running the smoke test right after a restart (empty cache, about 9 calls in a minute) made the last call (`/api/des/BTC`) fail with 429; it worked again a minute later.
- **Bad data seen:** on 2026-10-21 `/global` reported 24h volume of $2.95 × 10¹⁷, about 100,000 times the whole market cap (a coin with absurd reported volume inside the total). Any total volume above the total market cap is now dropped (`volume_unreliable: true`) and XGLB says why.
- **Note:** CoinGecko's PHP prices use its own FX rate. On 2026-10-21 it implied USD/PHP 63.46 vs Yahoo's 63.38 (about 0.13% apart).
- **Reliability:** both market calls returned 200 coins; `/coins/ethereum` returned every DES field (ETH has no max supply, which shows as —). Trending returned 15 coins, categories 774.
- **robots.txt:** `api.coingecko.com/robots.txt` disallows `/api/v3` for crawlers. We are not crawling: these are CoinGecko's documented public API calls, made at its published keyless rate, as an API client.
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

## alternative.me Crypto Fear & Greed Index (no key)

- **Used by:** `/api/crypto/fear-greed` (XGLB)
- **Endpoint:** `GET https://api.alternative.me/fng/?limit=365&format=json`. Returns newest first: `value` ("63", a string), `value_classification` ("Greed"), `timestamp` (Unix seconds, as a string). We sort oldest first for the chart.
- **Coverage:** one reading per day, 0 (extreme fear) to 100 (extreme greed), built from Bitcoin's volatility, volume and momentum, social media, dominance, and search trends. History goes back to February 2018.
- **Terms:** free to use; alternative.me asks that the data be credited next to where it is shown. XGLB's panel names the source and links to the index page.
- **Limits and reliability:** slow and sometimes down. On 2026-10-21 one request answered in 8 s, one in 21 s, and two timed out (25 s and 30 s). We wait up to 30 s and cache for an hour (the index changes once a day), so after the first good answer a slow day shows the last copy marked Stale.
- **Last checked:** 2026-10-21

## DefiLlama open API (no key)

- **Used by:** `/api/crypto/stablecoins` (XGLB), `/api/defi/tvl`, `/api/defi/chains`, `/api/defi/protocols` (DEFI)
- **Endpoints:**
  - `GET https://api.llama.fi/v2/historicalChainTvl`: total DeFi value locked per day in USD (about 3,300 days; the earliest are zero, before DeFi existed, and are skipped).
  - `GET https://api.llama.fi/v2/chains`: value locked per chain now (no change figures, so we show each chain's share instead).
  - `GET https://api.llama.fi/protocols`: every protocol (about 8,800) with value locked and 1h/1d/7d change. It is about **9 MB**, so it is fetched at most once an hour and only the top 25 are kept. Centralized exchanges (category `CEX`, e.g. "Binance CEX" at $174B) report reserves here but aren't DeFi, so they're left out. Bridges and liquid staking stay in.
  - `GET https://stablecoins.llama.fi/stablecoincharts/all`: daily stablecoin supply by peg (USD, EUR, gold-backed `peggedVAR` ...). We add every peg's `totalCirculatingUSD` (each valued in dollars): $305.16B on 2026-10-21.
- **Limits:** no key and no published hard limit; we cache every call for an hour and send an honest User-Agent. All values are in USD; pesos use Yahoo's USD/PHP (the same rate PORT uses), and the TVL chart stays in dollars because converting past days at today's rate would mislead.
- **robots.txt:** none on `api.llama.fi`.
- **Reliability:** every endpoint answered in under 1.5 s.
- **Last checked:** 2026-10-21

## Planned (later phases)

FRED (Phase 5c, needs a free key in `.env`), Philippine sources (Phase 9, researched then).
