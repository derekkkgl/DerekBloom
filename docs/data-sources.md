# Data sources

Free sources only. Each entry says what it covers, its limits, how reliable it has been, and when it was last checked.

## Yahoo Finance (via `yfinance` 1.7.0)

- **Used by:** `/api/quote`, `/api/chart`, `/api/wei`
- **Coverage:** US and international stocks and ETFs (Yahoo suffixes: `7203.T`, `0700.HK`, `ASML.AS`, `D05.SI`), global indices (`^GSPC`, `^N225` ...), FX (`PHP=X` = USD/PHP), futures (`GC=F`, `CL=F`), the dollar index (`DX-Y.NYB`), US 10Y yield (`^TNX`), and crypto price history (`BTC-USD`).
- **Limits:** unofficial, no API key, and Yahoo rate-limits heavy use (`YFRateLimitError` → we return 502 or the stale copy). Intraday history only goes back so far: 1m bars about 7 days, 5m–30m about 60 days, 1h about 730 days. Some international index quotes are delayed.
- **Quirks found:**
  - In yfinance 1.7, `Ticker.fast_info` returns `None` for every field, so quotes use `Ticker.info` instead (one request, includes the name).
  - An unknown ticker doesn't raise. `.info` returns `{"trailingPegRatio": None}` and history comes back empty, so we treat "no price and no name" as 404.
  - A batch `yf.download` across exchanges has NaN on days a given market was closed, so WEI takes each symbol's last non-NaN close.
  - Prices often arrive with float32 noise (e.g. `7712.56982421875`). We pass them through unchanged, and the frontend formatter rounds for display.
- **Reliability:** all 23 WEI symbols and the 7 Phase 1 test tickers returned data.
- **Last checked:** 2026-10-21

## CoinGecko public API (no key)

- **Used by:** `/api/crypto/markets`
- **Endpoint:** `GET https://api.coingecko.com/api/v3/coins/markets`, called twice (`vs_currency=usd` with a sparkline, `vs_currency=php` without) and joined by coin id.
- **Coverage:** top 100 coins by market cap. Price, 1h/24h/7d change, volume, market cap, 7-day hourly sparkline (168 points). Prices in PHP come directly from CoinGecko.
- **Limits:** the keyless tier is tightly rate-limited and throttles with HTTP 429. We cache 2 minutes and serve the last good copy on failure. A free Demo key (higher limit) can be added later if throttling becomes a problem.
- **Note:** CoinGecko's PHP prices use its own FX rate. On 2026-10-21 it implied USD/PHP 63.46 vs Yahoo's 63.38 (about 0.13% apart).
- **Reliability:** both calls returned 100 coins.
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
- **Limits:** each feed is fetched at most once per 5 minutes, with a 10 s timeout and an honest User-Agent (`SwissGlassTerminal/0.1 (personal RSS reader)`). Headlines and short summaries only. We link to the article and never copy full text.
- **Reliability:** all five feeds returned 10–38 items.
- **Last checked:** 2026-10-21

## Planned (later phases)

alternative.me Fear & Greed (Phase 5), DefiLlama (Phase 5), FRED (Phase 5, needs a free key in `.env`), Philippine sources (Phase 9, researched then).
