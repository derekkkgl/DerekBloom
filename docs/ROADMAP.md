# Swiss Glass Terminal: Function Catalog and Roadmap

Bloomberg-style functions rebuilt on free data, plus personal functions for Derek. Focus: **crypto and international markets**. Philippine assets are a small, optional last phase. Each function has a mnemonic typed in the command palette. "Phase" says when it gets built.

## Function catalog

### Workspace and navigation

| Mnemonic | Function | Notes | Phase |
| --- | --- | --- | --- |
| `Cmd+K` / `/` | Command palette | Fuzzy search over mnemonics, tickers, recent commands | 2 |
| `HELP` | Function directory | Generated from the registry, with shortcuts | 3 |
| `TAPE` | Macro ticker tape | Scrolling strip across the top: S&P 500, Nasdaq, Nikkei, DAX, BTC, ETH, BTC dominance, DXY, US 10Y, gold, oil, USD/PHP | 2 |
| `LP` | Launchpad layouts | Save and restore panel grids by name (SQLite) | 7 |
| Linked panels | Security groups | Each panel has a color tag (amber, cyan, magenta, none). Changing the ticker in one panel updates every panel with the same tag, like Bloomberg's linked windows | 7 |

### Crypto

| Mnemonic | Function | Data | Phase |
| --- | --- | --- | --- |
| `CRYPTO` | Crypto board | Top coins by market cap: price in USD and PHP, 1h/24h/7d change, volume, market cap, 7-day sparkline | 3 |
| `<COIN> DES` | Coin profile | Description, category, market cap and rank, circulating / total / max supply, fully diluted value, all-time high and distance from it, links | 3 |
| `<COIN> GP` | Coin chart | Same chart engine as stocks (candles, volume, MAs, indicators), 24/7 data | 3 |
| `XGLB` | Global crypto overview | Total market cap, 24h volume, BTC and ETH dominance, stablecoin supply, Fear & Greed Index with history | 5 |
| `XMOV` | Crypto movers | Top gainers and losers among the top 200, CoinGecko trending coins | 5 |
| `XSEC` | Crypto sectors | Category performance (Layer 1, DeFi, AI, memes, RWA ...) as a heat map | 5 |
| `DEFI` | DeFi monitor | Total value locked by chain and top protocols (DefiLlama) | 5 |
| `XCORR` | Crypto vs macro | Rolling correlation of BTC and ETH with Nasdaq, gold, DXY, US 10Y | 6 |

### Global markets

| Mnemonic | Function | Data | Phase |
| --- | --- | --- | --- |
| `WEI` | World equity indices and cross-asset monitor | Americas (S&P 500, Nasdaq, Dow, Russell 2000, TSX), Europe (FTSE, DAX, CAC, Euro Stoxx 50), Asia (Nikkei, Hang Seng, Shanghai, KOSPI, STI, ASX, Sensex), with % change, YTD, and market open/closed status | 1 to 3 |
| `WMAP` | World map | Indices on a world map colored by % change | 5 |
| `MOST` | Most active | yfinance predefined screeners (US) | 5 |
| `MOV` | Top gainers and losers | yfinance predefined screeners (US) | 5 |
| `IMAP` | Heat map | US sector ETFs (XLK, XLF, XLE ...), global ETFs (VT, VXUS, EEM, EWJ, FXI, INDA), and the watchlist, tiles sized by weight, colored by % change | 5 |
| `FX` | World currencies | Majors (EUR, JPY, GBP, CHF, AUD, CAD, CNY, SGD) vs USD, DXY, plus each vs PHP, and a cross-rate matrix | 5 |
| `CMDTY` | Commodities | Gold, silver, crude, natural gas, copper, wheat (futures via yfinance) | 5 |
| `GC` | Yield curve | US Treasury curve from FRED (1M to 30Y), today vs 1M ago vs 1Y ago | 5 |
| `RATES` | Rates | Fed funds, SOFR, US T-bills, 2Y/10Y spread (FRED). PH rates in the final phase | 5 |
| `ECO` | Economic calendar and indicators | Upcoming US releases (FRED release dates), latest CPI, unemployment, GDP, Fed funds | 5 |
| `N` / `TOP` | News wire | RSS: markets (CNBC, MarketWatch), crypto (CoinDesk, Cointelegraph, Decrypt), deduped, newest first, filterable by tab | 1 to 3 |

### Single security (`<TICKER> <MNEMONIC>`)

Works for US and international listings (Yahoo suffixes) unless noted.

| Mnemonic | Function | Data | Phase |
| --- | --- | --- | --- |
| `DES` | Description | Profile, sector, key stats, valuation (P/E, forward P/E, P/B, P/S, EV/EBITDA), dividend yield computed from rate and price, beta, 52-week range | 1 to 3 |
| `GP` | Price chart | Candles + volume, SMA 20/50/200, EMA, Bollinger Bands, RSI, MACD toggles, ranges 1D to MAX, compare overlay | 1 to 3 |
| `GIP` | Intraday chart | 1m to 30m bars for the session | 6 |
| `HP` | Historical prices | Table of OHLCV with period selector, Excel export | 6 |
| `CN` | Company or coin news | RSS filtered to the ticker | 6 |
| `FA` | Financial analysis | Income statement, balance sheet, cash flow, annual and quarterly, with YoY growth and margins | 6 |
| `ERN` | Earnings | Past EPS actual vs estimate with surprise %, next earnings date | 6 |
| `EE` | Estimates and analyst view | Price targets (low, mean, high), recommendation trend | 6 |
| `DVD` | Dividends | History, trailing yield, growth, ex-dates | 6 |
| `HDS` | Holders | Major and institutional holders | 6 |
| `OMON` | Options monitor | Chain by expiry with strikes, bid/ask, IV, open interest (US only) | 6 |
| `RV` | Relative value | Side-by-side valuation vs a peer list Derek defines | 6 |
| `COMP` | Comparative returns | Total return of several assets (stocks, ETFs, coins) on one rebased chart, in PHP or native currency | 6 |
| `BETA` | Beta | Regression vs a chosen benchmark with scatter plot, R squared | 6 |
| `CORR` | Correlation matrix | Rolling correlation across any list of tickers and coins | 6 |
| `NOTE` | Thesis notes | Per-asset investment journal: why I bought, what would make me sell, dated entries (SQLite) | 7 |

### Portfolio and personal

| Mnemonic | Function | Notes | Phase |
| --- | --- | --- | --- |
| `PORT` | Portfolio | Holdings from transactions, cost basis including fees, spreads, and FX costs, market value, unrealized and realized P&L, allocation by asset class (crypto, stocks, ETFs, cash), region, and currency, all viewable in PHP | 4 |
| `PORT` risk tab | Risk | Volatility, max drawdown, beta vs a benchmark, correlation of holdings, crypto share of portfolio | 6 |
| `TXN` | Transactions | Add, edit, delete buys, sells, dividends, deposits, transfers; CSV import from exchange and broker exports | 4 |
| `GOAL` | Income goal | Target monthly income (default ₱2,000), current yield of holdings, capital needed at an assumed yield, months to goal at a monthly contribution, projected path chart | 4 |
| `YLD` | Cash-flow yield | Expected yearly income from each holding (dividends, staking or interest entered manually) | 4 |
| `ALRT` | Alerts | Price level and % move alerts for stocks and coins; backend checks on a schedule (crypto runs 24/7) and sends a macOS notification (`osascript`) plus an in-app toast | 7 |
| `EQS` | Equity screener | Build screens with yfinance `EquityQuery` (US), save them | 7 |
| `BRIEF` | Morning brief | One screen: overnight moves in global indices and crypto, biggest movers in holdings, Fear & Greed, today's ECO releases, top 5 headlines, goal progress | 7 |
| `SQL` | SQL console | Read-only query box against the local SQLite database with result table and Excel export. For practicing SQL on his own data | 7 |
| `XL` | Excel bridge | Lists every `?format=csv` endpoint with copyable Power Query URLs | 7 |

### Not included (needs paid data or is out of scope)

Bloomberg chat (IB/MSG), real-time Level 2 data and order books, exchange-specific derivatives data (funding rates, open interest), BQL, on-chain analytics, order execution, and anything that trades.

## Build phases

One phase per session. Plan first, build, test, commit, push, stop.

**Phase 1: Backend core**
Endpoints `/api/health`, `/api/wei`, `/api/quote/{ticker}`, `/api/chart/{ticker}?range=&interval=` (candles, volume, SMA 20/50/200), `/api/news`, `/api/crypto/markets` (CoinGecko, USD and PHP). TTL cache with per-key lock and stale-on-error, `clean()` for NaN, ticker validation and aliases, offline pytest suite, `scripts/smoke_test.sh`.
Done when: tests pass, and the smoke test returns 200 for every endpoint with real data for AAPL, NVDA, VOO, 7203.T, BTC, ETH, and `PHP=X`.

**Phase 2: Frontend shell**
Next.js app, theme tokens, fonts, grid background, `Panel`, `Num`, formatters, ticker tape, command palette with function registry, four-zone workspace (tape on top, asset matrix left, chart center, news and macro wire right).
Done when: the shell loads with the real ticker tape and the palette opens with Cmd+K and lists registered functions.

**Phase 3: Core screens (MVP)**
`WEI`, `CRYPTO`, `GP`, `DES` (stocks and coins), `N`, `HELP` wired to the API, `start.sh`, README with setup steps and a screenshot.
Done when: `./start.sh` starts everything, `BTC GP` and `NVDA GP` draw real candlestick charts, `ETH DES` shows supply and all-time high, and the repo is pushed. **This is v1. Celebrate it.**

**Phase 4: Portfolio, PHP, and goal**
SQLite schema and migrations in `sql/`, transactions with fees, CSV import, global PHP toggle, `PORT`, `TXN`, `YLD`, `GOAL`, Excel export on every table.
Done when: Derek enters his real holdings and sees value and P&L in PHP and months to his income goal.

**Phase 5: Crypto depth and global breadth**
`XGLB`, `XMOV`, `XSEC`, `DEFI`, `WMAP`, `MOST`, `MOV`, `IMAP`, `FX`, `CMDTY`, `GC`, `RATES`, `ECO`. FRED key in `.env`.

**Phase 6: Security depth**
`GIP`, `HP`, `CN`, `FA`, `ERN`, `EE`, `DVD`, `HDS`, `OMON`, `RV`, `COMP`, `BETA`, `CORR`, `XCORR`, PORT risk tab.

**Phase 7: Workflow**
Linked panels, `LP` layouts, `ALRT`, `NOTE`, `EQS`, `BRIEF`, `SQL`, `XL`.

**Phase 8: Polish**
Full keyboard map, empty and error states everywhere, performance pass (memoized tables, virtualized long lists), README with GIF demo, architecture diagram, and a "how I built this" section for the portfolio.

**Phase 9 (optional, low priority): Philippines**
Research free sources for PSE quotes, PSEi, ATRAM global feeder funds and other UITF NAVPU history, PH T-bill auction results, BSP policy rate, and Pag-IBIG MP2 rates. Write findings to `docs/data-sources.md`. Ask Derek before any scraping. Where no reliable free source exists, support manual price entry (for example, typing in a fund's NAVPU) so these assets still count in `PORT` and `GOAL`.
