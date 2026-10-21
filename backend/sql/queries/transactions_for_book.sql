-- Every transaction in the order the cost engine replays them: by date, and within a
-- day, money in before money out (a same-day buy comes before the sell it pays for).
SELECT
    id,
    account_id,
    trade_date,
    type,
    asset,
    units,
    price,
    price_currency,
    fee,
    fee_currency,
    php_amount
FROM transactions
ORDER BY
    trade_date,
    CASE type
        WHEN 'DEPOSIT' THEN 0
        WHEN 'BUY' THEN 1
        WHEN 'REWARD' THEN 2
        WHEN 'DIVIDEND' THEN 3
        WHEN 'SELL' THEN 4
        WHEN 'TRANSFER' THEN 5
        ELSE 6
    END,
    id;
