# The Daily Tape

A local, self-hosted financial terminal inspired by the Bloomberg Terminal, built on free data. Focus: crypto and international markets, with PHP as the home currency.

**Status:** v1 (Phase 3) done. Every core screen runs on live data: the front page, world indices, the crypto board, price charts, descriptions for stocks, ETFs, and coins, the news wire, and a function directory. Portfolio, PHP totals, and the income goal arrive in Phase 4. See [docs/ROADMAP.md](docs/ROADMAP.md) for the full plan.

![The Daily Tape front page](docs/screenshot.png)

## Quick start

After the one-time [setup](#setup):

```bash
./start.sh
```

This starts the backend on `http://localhost:8000` and the frontend on `http://localhost:3000`. Open http://localhost:3000. Press Ctrl+C in the same terminal to stop both.

## What runs today

The paper is cream, ink, and serif headlines. Every screen opens from **Look up** (`Cmd+K`, `Ctrl+K`, or `/`): type a command and press Enter.

| Type | Screen | What it shows |
| --- | --- | --- |
| Home | Front page | US stocks and ETFs with 1-month sparklines, your coins, eight world indices with open/closed, and the latest headlines |
| `WEI` | World equity indices | 16 indices by region plus BTC, ETH, USD/PHP, the dollar, gold, oil, and the US 10Y, with day and YTD change |
| `CRYPTO` | Crypto board | Top 100 coins: price, 1h/24h/7d change, volume, market cap, 7-day sparkline |
| `NVDA GP`, `BTC GP` | Price chart | Candles, volume, SMA 20/50/200, ranges 1D to MAX, hover legend with OHLC and SMA values |
| `NVDA DES`, `VOO DES`, `ETH DES` | Description | Stocks: key stats, valuation, profile. ETFs: fund facts. Coins: supply, all-time high and distance from it, links |
| `N` | News wire | Markets and crypto headlines with All / Markets / Crypto tabs |
| `HELP` | Function directory | Every function, how to type it, and the keyboard shortcuts |

A ticker alone (`NVDA`) opens its description. Up arrow in an empty Look up box recalls recent commands. International listings use Yahoo suffixes (`7203.T GP`, `0700.HK DES`), indices use `^` (`^N225 GP`).

**USD / PHP toggle** (top right): switches the ticker tape's USD prices, the crypto board, coin descriptions, Home's crypto column, and price charts to pesos. Peso changes include the peso's own move. Charts convert every candle at the USD/PHP rate of its own day (or 5 minutes), never today's rate, so a peso chart shows what the asset was really worth in pesos at the time. Indices, exchange rates, and non-USD listings (like `7203.T`) stay in their own currency, labeled.

**Chart legend**: hover a candle for its prices and time. Intraday candles show their local time; daily, weekly, and monthly candles show when they closed in your time (e.g. "closed 04:00 Manila"), or the last trade if still open.

**Backend**: a FastAPI backend that fetches market data, cleans it, caches it, and serves JSON (or CSV for Excel).

| Endpoint | What it returns | Source | Cache |
| --- | --- | --- | --- |
| `GET /api/health` | Server status | local | none |
| `GET /api/quote/{ticker}` | Price, change, day range, 52-week range, market cap | Yahoo | 60 s |
| `GET /api/quotes?symbols=AAPL,NVDA,...` | Last close, day change, and a month of closes for up to 25 tickers in one batch | Yahoo | 60 s |
| `GET /api/chart/{ticker}?range=1y&interval=1d&currency=native\|PHP` | OHLCV candles with SMA 20/50/200 and each bar's close time; `currency=PHP` converts bar by bar at that bar's USD/PHP rate | Yahoo | 60 s intraday, 10 min daily |
| `GET /api/des/{ticker}` | Stocks/ETFs: profile, valuation, 52-week range, dividend yield, fund facts. Coins: profile, supply, all-time high, distance from it (USD and PHP) | Yahoo / CoinGecko | 6 h profile (coin prices 2 min) |
| `GET /api/wei` | 16 world indices + BTC, ETH, USD/PHP, DXY, gold, crude, US 10Y, with YTD and open/closed | Yahoo | 60 s |
| `GET /api/news?category=all\|markets\|crypto&limit=50` | Deduplicated headlines, newest first | RSS | 5 min per feed |
| `GET /api/crypto/markets` | Top 100 coins in USD and PHP, 1h/24h/7d change, sparklines | CoinGecko | 2 min |
| `GET /api/crypto/global` | Total crypto market cap and volume (USD, PHP), BTC and ETH dominance | CoinGecko | 5 min |

Tickers accept aliases: `BTC`, `ETH`, `XRP`, `SOL`, `BNB`, `ADA`, `DOGE`, `USDPHP`.

Every response looks like `{"data": ..., "meta": {"source", "as_of", "cached", "stale"}}`. Errors look like `{"error": {"code", "message"}}` with a real HTTP status (400, 404, 502). If a source fails, the last good copy is served with `stale: true`, and the screen says "Stale" in its header.

**Excel:** add `?format=csv` to `/api/wei`, `/api/quotes`, `/api/chart/...`, `/api/news`, or `/api/crypto/markets`, then in Excel use Data → From Web and paste the URL.

## Setup

Requires Python 3.11+ (built with 3.12) and Node 20.9+ (built with Node 24).

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

```bash
cd frontend
npm install
```

The frontend calls the backend at `http://localhost:8000`. To change that, copy `frontend/.env.example` to `frontend/.env.local` and edit `NEXT_PUBLIC_API_URL`.

## Run

```bash
./start.sh
```

Or run each half yourself, in two terminals:

```bash
cd backend
.venv/bin/uvicorn app.main:app --port 8000
```

```bash
cd frontend
npm run dev
```

Open http://localhost:3000 for the paper and http://localhost:8000/docs to try every endpoint in the browser.

## Test

Offline unit tests (the network is blocked during tests):

```bash
cd backend
.venv/bin/pytest
```

Frontend unit tests (formatting, command parsing, tape and chart math, PHP views), types, lint, and a production build:

```bash
cd frontend
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Smoke test against the running backend with real data (every endpoint, plus AAPL, NVDA, VOO, 7203.T, BTC, ETH, PHP=X):

```bash
./scripts/smoke_test.sh
```

## Layout

```
backend/app/main.py        FastAPI app, CORS, error envelope
backend/app/core/          cache, clean (NaN -> null), tickers + aliases, WEI rows + market hours
backend/app/services/      yahoo.py, coingecko.py, rss.py (fetchers + pure shapers)
backend/app/routers/des.py DES: Yahoo for stocks and ETFs, CoinGecko for coins
backend/app/routers/       one router per area
backend/tests/             offline pytest suite
scripts/smoke_test.sh      live endpoint check
start.sh                   starts backend + frontend, Ctrl+C stops both
frontend/src/app/          pages: sections (/, /markets ...) and functions (/fn/GP/NVDA)
frontend/src/functions/    one folder per terminal function: index.tsx (registry entry) + the screen
frontend/src/components/   Masthead, TickerTape, CommandPalette, Panel, Num, Chart, FrontPage
frontend/src/lib/          api client, formatters, registry, command parser, chart/crypto/WEI helpers
frontend/src/lib/frontPage.ts  the lists Home shows (edit to change your front page)
docs/ROADMAP.md            function catalog and phases
docs/data-sources.md       each source's coverage, limits, quirks
```

## Data sources

Yahoo Finance (`yfinance`), CoinGecko public API, and public RSS feeds. Charts are drawn with TradingView [Lightweight Charts](https://www.tradingview.com/lightweight-charts/). Details and limits in [docs/data-sources.md](docs/data-sources.md). This is an information tool only: no trading or broker connections.
