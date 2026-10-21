-- Every transaction, newest first, with its account name and the deposit rate
-- (from deposit_rates.sql) that sets the peso cost of a USD or USDT trade.
WITH rates AS (
    SELECT
        id,
        account_id,
        trade_date,
        SUM(php_amount) OVER running / SUM(units) OVER running AS avg_rate
    FROM transactions
    WHERE type = 'DEPOSIT' AND asset IN ('USD', 'USDT') AND php_amount IS NOT NULL AND units > 0
    WINDOW running AS (PARTITION BY account_id ORDER BY trade_date, id ROWS UNBOUNDED PRECEDING)
)
SELECT
    t.id,
    t.trade_date,
    t.account_id,
    a.name AS account,
    t.type,
    t.asset,
    t.units,
    t.price,
    t.price_currency,
    t.fee,
    t.fee_currency,
    t.php_amount,
    t.note,
    t.source,
    (
        SELECT r.avg_rate
        FROM rates AS r
        WHERE r.account_id = t.account_id AND r.trade_date <= t.trade_date
        ORDER BY r.trade_date DESC, r.id DESC
        LIMIT 1
    ) AS deposit_rate
FROM transactions AS t
JOIN accounts AS a ON a.id = t.account_id
ORDER BY t.trade_date DESC, t.id DESC;
