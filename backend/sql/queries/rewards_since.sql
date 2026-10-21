-- Staking and other rewards received on or after a date (the last 12 months for YLD).
SELECT asset, trade_date, units, price, price_currency
FROM transactions
WHERE type = 'REWARD' AND trade_date >= :since
ORDER BY asset, trade_date;
