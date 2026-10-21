# The Daily Tape

A local, self-hosted financial terminal inspired by the Bloomberg Terminal, built on free data. Focus: crypto and international markets, with PHP as the home currency.

**Status:** Phase 1 (backend core) done. The frontend arrives in Phase 2. See [docs/ROADMAP.md](docs/ROADMAP.md) for the full plan.

## What runs today

A FastAPI backend on `http://localhost:8000` that fetches market data, cleans it, caches it, and serves JSON (or CSV for Excel).

| Endpoint | What it returns | Source | Cache |
| --- | --- | --- | --- |
| `GET /api/health` | Server status | local | none |
| `GET /api/quote/{ticker}` | Price, change, day range, 52-week range, market cap | Yahoo | 60 s |
| `GET /api/chart/{ticker}?range=1y&interval=1d` | OHLCV candles with SMA 20/50/200 | Yahoo | 60 s intraday, 10 min daily |
| `GET /api/wei` | 16 world indices + BTC, ETH, USD/PHP, DXY, gold, crude, US 10Y, with YTD and open/closed | Yahoo | 60 s |
| `GET /api/news?category=all\|markets\|crypto&limit=50` | Deduplicated headlines, newest first | RSS | 5 min per feed |
| `GET /api/crypto/markets` | Top 100 coins in USD and PHP, 1h/24h/7d change, sparkline | CoinGecko | 2 min |
| `GET /api/crypto/global` | Total crypto market cap and volume (USD, PHP), BTC and ETH dominance | CoinGecko | 5 min |

Tickers accept aliases: `BTC`, `ETH`, `XRP`, `SOL`, `BNB`, `ADA`, `DOGE`, `USDPHP`. International listings use Yahoo suffixes (`7203.T`, `0700.HK`).

Every response looks like `{"data": ..., "meta": {"source", "as_of", "cached", "stale"}}`. Errors look like `{"error": {"code", "message"}}` with a real HTTP status (400, 404, 502). If a source fails, the last good copy is served with `stale: true`.

**Excel:** add `?format=csv` to `/api/wei`, `/api/chart/...`, `/api/news`, or `/api/crypto/markets`, then in Excel use Data → From Web and paste the URL.

## Setup

Requires Python 3.11+ (built with 3.12).

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run

```bash
cd backend
.venv/bin/uvicorn app.main:app --port 8000
```

Then open http://localhost:8000/docs to try every endpoint in the browser.

## Test

Offline unit tests (the network is blocked during tests):

```bash
cd backend
.venv/bin/pytest
```

Smoke test against the running server with real data (AAPL, NVDA, VOO, 7203.T, BTC, ETH, PHP=X):

```bash
./scripts/smoke_test.sh
```

## Layout

```
backend/app/main.py        FastAPI app, CORS, error envelope
backend/app/core/          cache, clean (NaN -> null), tickers + aliases, WEI rows + market hours
backend/app/services/      yahoo.py, coingecko.py, rss.py (fetchers + pure shapers)
backend/app/routers/       one router per area
backend/tests/             offline pytest suite
scripts/smoke_test.sh      live endpoint check
docs/ROADMAP.md            function catalog and phases
docs/data-sources.md       each source's coverage, limits, quirks
```

## Data sources

Yahoo Finance (`yfinance`), CoinGecko public API, and public RSS feeds. Details and limits in [docs/data-sources.md](docs/data-sources.md). This is an information tool only: no trading or broker connections.
