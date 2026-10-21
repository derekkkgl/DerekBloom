-- 001: portfolio, cash, yield inputs, and goal settings.
-- STRICT tables reject a value of the wrong type instead of silently storing it.

-- Where money sits. Buys priced in USD or USDT get their peso cost from the
-- average rate of that account's deposits (see deposit_rates.sql).
CREATE TABLE accounts (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
) STRICT;

INSERT INTO accounts (id, name) VALUES
    (1, 'Coins.ph'),
    (2, 'Binance'),
    (3, 'Gotrade'),
    (4, 'Manual');

-- Every money event. What `units` means depends on the type:
--   BUY, SELL, REWARD   units of the asset (BTC, VOO)
--   TRANSFER            units moved between accounts; `fee` is the network fee, in units of the asset
--   DEPOSIT, WITHDRAW   amount of the currency in `asset` (USD, USDT, PHP) received or taken out;
--                       php_amount is the pesos you sent (fees included) or got back
--   DIVIDEND            cash received, in price_currency; `asset` is the ticker that paid it
CREATE TABLE transactions (
    id             INTEGER PRIMARY KEY,
    account_id     INTEGER NOT NULL REFERENCES accounts (id),
    trade_date     TEXT NOT NULL CHECK (trade_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    type           TEXT NOT NULL CHECK (type IN ('BUY', 'SELL', 'DEPOSIT', 'WITHDRAW', 'DIVIDEND', 'REWARD', 'TRANSFER')),
    asset          TEXT NOT NULL,
    units          REAL NOT NULL CHECK (units >= 0),
    price          REAL CHECK (price >= 0),          -- per unit, in price_currency (BUY, SELL, optional on REWARD)
    price_currency TEXT NOT NULL DEFAULT 'USD' CHECK (price_currency IN ('USD', 'USDT', 'PHP')),
    fee            REAL NOT NULL DEFAULT 0 CHECK (fee >= 0),
    fee_currency   TEXT,                             -- NULL means the same as price_currency
    php_amount     REAL CHECK (php_amount >= 0),
    note           TEXT,
    source         TEXT NOT NULL DEFAULT 'manual',   -- 'manual' now; CSV importers (Phase 4b) set their own
    source_hash    TEXT UNIQUE,                      -- lets importers skip rows already imported
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
) STRICT;

CREATE INDEX transactions_asset_date ON transactions (asset, trade_date);
CREATE INDEX transactions_account_type ON transactions (account_id, type, trade_date);

-- What each asset is, filled in from Yahoo the first time it's used.
CREATE TABLE assets (
    asset        TEXT PRIMARY KEY,                   -- what you type: BTC, VOO
    yahoo_symbol TEXT NOT NULL,                      -- what Yahoo calls it: BTC-USD, VOO
    name         TEXT,
    class        TEXT NOT NULL CHECK (class IN ('crypto', 'stock', 'etf', 'fund')),
    region       TEXT NOT NULL,                      -- where it's listed; Global for crypto
    currency     TEXT NOT NULL                       -- currency of Yahoo's price
) STRICT;

-- Cash you type in per account. Buys and sells don't change it.
CREATE TABLE cash_balances (
    account_id INTEGER NOT NULL REFERENCES accounts (id),
    currency   TEXT NOT NULL CHECK (currency IN ('USD', 'USDT', 'PHP')),
    amount     REAL NOT NULL CHECK (amount >= 0),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (account_id, currency)
) STRICT;

-- A staking or interest rate you set for a holding with no dividends or rewards.
CREATE TABLE yield_inputs (
    asset    TEXT PRIMARY KEY,
    kind     TEXT NOT NULL CHECK (kind IN ('staking', 'interest')),
    rate_pct REAL NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100)
) STRICT;

-- One row of settings for GOAL and YLD.
CREATE TABLE settings (
    id                       INTEGER PRIMARY KEY CHECK (id = 1),
    target_monthly_php       REAL NOT NULL DEFAULT 2000 CHECK (target_monthly_php > 0),
    contribution_monthly_php REAL NOT NULL DEFAULT 2000 CHECK (contribution_monthly_php >= 0),
    assumed_yield_pct        REAL NOT NULL DEFAULT 5 CHECK (assumed_yield_pct >= 0 AND assumed_yield_pct <= 100),
    withholding_pct          REAL NOT NULL DEFAULT 25 CHECK (withholding_pct >= 0 AND withholding_pct <= 100),
    goal_include_all         INTEGER NOT NULL DEFAULT 0 CHECK (goal_include_all IN (0, 1))
) STRICT;

INSERT INTO settings (id) VALUES (1);
