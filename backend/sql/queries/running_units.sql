-- Units of one asset held after each transaction that changes it, oldest first.
-- Fees paid in this asset (a transfer's network fee, a Binance fee in BNB) count too.
-- The API refuses a change if any row here would go below zero.
SELECT
    id,
    trade_date,
    type,
    SUM(delta) OVER (ORDER BY trade_date, day_order, id ROWS UNBOUNDED PRECEDING) AS units_after
FROM (
    SELECT
        id,
        trade_date,
        type,
        CASE type WHEN 'BUY' THEN 1 WHEN 'REWARD' THEN 2 WHEN 'SELL' THEN 4 WHEN 'TRANSFER' THEN 5 ELSE 6 END AS day_order,
        CASE WHEN asset = :asset THEN
            CASE type WHEN 'BUY' THEN units WHEN 'REWARD' THEN units WHEN 'SELL' THEN -units ELSE 0 END
        ELSE 0 END
        - CASE WHEN fee_currency = :asset THEN fee ELSE 0 END AS delta
    FROM transactions
    WHERE (asset = :asset AND type IN ('BUY', 'SELL', 'REWARD', 'TRANSFER'))
       OR fee_currency = :asset
)
ORDER BY trade_date, day_order, id;
