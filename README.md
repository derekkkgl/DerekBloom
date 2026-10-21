# The Daily Tape

A local, self-hosted financial terminal inspired by the Bloomberg Terminal, built on free data. Focus: crypto and international markets, with PHP as the home currency.

**Status:** Phase 2 (frontend shell) done: the paper's masthead, a live ticker tape, section pages, and a Bloomberg-style command palette. Real screens (WEI, CRYPTO, GP, DES, news) arrive in Phase 3. See [docs/ROADMAP.md](docs/ROADMAP.md) for the full plan.

## What runs today

**Frontend** on `http://localhost:3000`, styled as a morning broadsheet (cream paper, ink, serif headlines):

- Masthead with sections (Home, Markets, Portfolio, Goal, News), the **Look up** box, and a **USD / PHP** toggle.
- **Ticker tape** under the masthead with live S&P 500, Nasdaq, Nikkei, DAX, BTC, ETH, BTC dominance, DXY, US 10Y, gold, oil, and USD/PHP. With PHP on, BTC, ETH, gold, and oil are shown in pesos, and their change includes the peso's own move.
- **Command palette**: press `Cmd+K`, `Ctrl+K`, or `/`, or click Look up. Type `NVDA GP`, `BTC DES`, or `WEI` and press Enter. A ticker alone opens `DES`. Up arrow in an empty box recalls past commands.

**Backend**: a FastAPI backend on `http://localhost:8000` that fetches market data, cleans it, caches it, and serves JSON (or CSV for Excel).

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
cd backend
.venv/bin/uvicorn app.main:app --port 8000
```

Then open http://localhost:8000/docs to try every endpoint in the browser.

In a second terminal:

```bash
cd frontend
npm run dev
```

Then open http://localhost:3000.

## Test

Offline unit tests (the network is blocked during tests):

```bash
cd backend
.venv/bin/pytest
```

Frontend unit tests (formatting, command parsing, tape math), types, and lint:

```bash
cd frontend
npm test
npx tsc --noEmit
npm run lint
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
frontend/src/app/          pages: sections (/, /markets ...) and functions (/fn/GP/NVDA)
frontend/src/functions/    one folder per terminal function (WEI, GP, DES ...)
frontend/src/components/   Masthead, TickerTape, CommandPalette, Panel, Num
frontend/src/lib/          api client, formatters, function registry, command parser
docs/ROADMAP.md            function catalog and phases
docs/data-sources.md       each source's coverage, limits, quirks
```

## Data sources

Yahoo Finance (`yfinance`), CoinGecko public API, and public RSS feeds. Details and limits in [docs/data-sources.md](docs/data-sources.md). This is an information tool only: no trading or broker connections.
