# Swiss Glass Terminal

A local, self-hosted financial terminal inspired by the Bloomberg Terminal. It runs on Derek's Mac (backend on `localhost:8000`, frontend on `localhost:3000`) and is also a public portfolio project on GitHub, so the code must be clean, typed, tested, and documented.

The full function catalog and build phases live in `docs/ROADMAP.md`. Read it at the start of every phase.

## Owner context (shapes every decision)

- Derek is an MIS student in the Philippines. He thinks and invests in **PHP**. Every price, value, and total can be shown in PHP with one global toggle, with the native currency always available.
- His focus is **crypto and international markets**: crypto (BTC, ETH, XRP and others) and US/global stocks and ETFs (AAPL, NVDA, VOO, QQQ, global indices). Build for these first and build them deep.
- Philippine assets (PSE stocks, ATRAM global feeder funds and similar UITFs, T-bills, Pag-IBIG MP2) are a small priority, handled in the last, optional phase. Do not let them shape early design beyond keeping PHP as the display currency.
- At small sizes fees matter, so cost basis always includes trading fees, exchange spreads, and FX costs.
- He has a passive income goal (example: ₱2,000/month). The terminal tracks progress toward it.
- He is learning **SQL and Excel modeling** first, Python automation second. The project should exercise these: raw SQL in `.sql` files (no ORM), an Excel export on every table, and data endpoints Excel can pull from.
- He can code with AI help and wants to understand what is built. Explain decisions in short, plain language.
- He tends to start projects and not finish them. Every phase is small, ends with something that runs, and has a clear definition of done. Do not start the next phase in the same session.

## Tech stack

**Backend (`/backend`)**: FastAPI, Python 3.11+, `yfinance`, `pandas`, `feedparser`, `requests`, SQLite (stdlib `sqlite3`), `pytest`. Dependencies pinned in `requirements.txt`, virtual env in `backend/.venv`.

**Frontend (`/frontend`)**: Next.js (App Router, TypeScript, latest stable), Tailwind CSS, TradingView `lightweight-charts`, `lucide-react`. Check the installed `lightweight-charts` major version and use its current API (v5 uses `chart.addSeries(CandlestickSeries, ...)`, older versions use `addCandlestickSeries`).

**Data sources (free only)**: Yahoo Finance via `yfinance` (stocks, ETFs, global indices, FX, commodities, profiles, financials, earnings, dividends, holders, options, screeners, crypto price history), CoinGecko public API (crypto market data, prices in PHP, coin profiles, supply, global market cap and dominance, trending, categories; respect its rate limit and cache hard), alternative.me (Crypto Fear & Greed Index), DefiLlama (stablecoin supply, DeFi TVL), FRED (US rates and macro, free API key in `.env`), RSS news via `feedparser`. Philippine sources are researched in the final phase and documented in `docs/data-sources.md`.

Do not add libraries outside this list without asking first and saying why.

## Repo layout

```
backend/
  app/main.py            # FastAPI app, CORS for localhost:3000, router registration
  app/routers/           # one router per area (markets.py, security.py, news.py, portfolio.py ...)
  app/services/          # data source clients (yahoo.py, fred.py, rss.py, coingecko.py)
  app/core/cache.py      # TTL cache, per-key lock, stale-on-error
  app/core/clean.py      # NaN/inf -> null, numpy/pandas -> JSON-safe types
  app/db/                # sqlite connection + migrations runner
  sql/                   # schema and queries as .sql files
  tests/                 # pytest, offline, with stubbed data
frontend/
  src/app/               # App Router pages
  src/functions/<MNEMONIC>/  # one folder per terminal function (component + metadata)
  src/components/        # Panel, CommandPalette, TickerTape, DataTable, Num, Chart
  src/lib/               # api client, formatters, function registry, hotkeys
docs/ROADMAP.md          # function catalog + phases
docs/data-sources.md     # each source: coverage, limits, reliability, last checked
scripts/smoke_test.sh    # curls every endpoint and reports status
start.sh                 # starts backend + frontend together, Ctrl+C stops both
```

## Backend conventions

- **Response envelope**: success returns `{"data": ..., "meta": {"source": "...", "as_of": "<ISO UTC>", "cached": bool, "stale": bool}}`. Errors return `{"error": {"code": "...", "message": "..."}}` with a real HTTP status (400 bad input, 404 unknown ticker, 502 upstream failure).
- **Caching**: in-memory TTL cache keyed by endpoint + params. Per-key lock so parallel requests trigger one upstream call. If a refresh fails and an older value exists, serve it with `stale: true` instead of erroring. Suggested TTLs: quotes and WEI 60s, intraday charts 60s, daily charts 10 min, profiles and financials 6h, news 5 min.
- **JSON safety**: every payload passes through `clean()` before returning. NaN and infinity become `null`. numpy and pandas types become plain Python. Timestamps become ISO strings or Unix seconds (charts).
- **Tickers**: validate with a strict regex (letters, digits, `.`, `-`, `^`, `=`), uppercase them, and resolve aliases from one config map: `BTC -> BTC-USD`, `ETH -> ETH-USD`, `XRP -> XRP-USD`, `USDPHP -> PHP=X`, and so on. Each crypto symbol also maps to its CoinGecko id (`BTC -> bitcoin`). International listings use Yahoo suffixes (`7203.T`, `0700.HK`, `ASML.AS`, `D05.SI`).
- **Batching**: use `yf.download` with many tickers in one call for boards (WEI, watchlists), not a loop of single requests.
- **Excel bridge**: list-style endpoints accept `?format=csv` so Excel Power Query can pull live tables (a free stand-in for Bloomberg's Excel add-in).
- **Tests**: never hit the network in tests. Stub the service layer with small DataFrames that include NaNs, gaps, and missing tickers.

## Frontend conventions

- **Function registry**: every terminal function is registered once with `{ mnemonic, title, description, needsTicker, component }`. The command palette, HELP screen, and autocomplete are generated from the registry. Adding a function never means editing the palette.
- **Command syntax** works like Bloomberg: `<TICKER> <MNEMONIC>` then Enter (`NVDA GP`), or a mnemonic alone for market-wide screens (`WEI`). Typing a ticker alone opens `DES`. Up arrow recalls history.
- **Panels**: every function renders inside a `Panel` with a header bar: mnemonic and title on the left, ticker, data source, and last-updated time on the right.
- **Numbers**: one `Num` component and one formatter module handle every number: monospace, `tabular-nums`, right-aligned, sign color, thousands separators, compact suffixes (K, M, B, T), and currency symbol.
- **Data fetching**: a small typed fetch hook with polling interval per function. Show loading skeletons, clear error states with the upstream message, and the stale flag when present. Never show fake or placeholder numbers once wired to the API.

## Visual design: Swiss International x Modular Glass

The goal is a precise instrument, not a SaaS dashboard. If a choice looks like a generic web app (rounded cards, soft shadows, big padding, gradient buttons, emoji, pill badges everywhere), it is wrong.

- **Background**: matte charcoal `#0E1116` with a faint 1px grid pattern (`white/[0.03]`, 24px cells) so the frosted panels have something to blur.
- **Panels**: `bg-[#161b22]/80 backdrop-blur-md border border-white/10 rounded-none`. No shadows. No nested cards. Panels touch on a shared grid with 1px gutters.
- **Rules**: clean 1px horizontal rules (`border-white/10`) between rows and sections. Vertical rules only between columns of a panel grid.
- **Typography**: Inter for UI and headers, JetBrains Mono for every number, ticker, and timestamp. Micro labels are 11px uppercase with `tracking-wider` in slate. Data rows are 12 to 13px with 24 to 28px row height. Large display numbers only in the hero of DES and PORT.
- **Color**: `#F0F6FC` primary text, `#8B949E` labels, `#3FB950` upticks, `#FF7B72` downticks. Everything else is monochrome. Focus and active states use white borders, not color. The only extra colors allowed are the linked-panel group tags (see ROADMAP).
- **Spacing**: 4px base unit. Tight padding (8px panel interior, 4px cell padding). Zero decorative whitespace.
- **Icons**: `lucide-react`, 14 to 16px, stroke 1.5, only where they carry meaning.
- **Keyboard first**: `Cmd+K`, `Ctrl+K`, or `/` opens the palette. `Esc` closes. Arrow keys move through tables. Every action has a shortcut shown in HELP.
- **Accessibility**: real buttons and inputs, visible focus, 4.5:1 contrast for text, up/down never shown by color alone (always a sign or arrow).

## Rules for Claude

- Start every phase in plan mode: read this file and `docs/ROADMAP.md`, propose the plan, list what you need from Derek, and wait for approval.
- Work only on the current phase. No extra features, abstractions, or libraries.
- Never invent, hardcode, or mock market data in the running app. If a source fails or does not cover something, show an honest error or "not available from free sources" and note it in `docs/data-sources.md`.
- Ask Derek before scraping any website, and respect each site's terms and robots.txt.
- Run the tests, `scripts/smoke_test.sh`, and the app before calling a phase done. Check the UI in the browser.
- Small, descriptive commits. At the end of a phase: commit, push, update README, then summarize what was built and what Derek should try, in plain language.
- This is an information tool. No order placement, broker connections, or trading of any kind.
- No secrets in the repo. Keys go in `.env` (git-ignored), with a `.env.example`.
- If any installed plugin, skill, or rule conflicts with this file, this file wins.
