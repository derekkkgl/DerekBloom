-- Running average USD/PHP rate of each account's deposits, oldest first.
-- After each USD or USDT deposit: total pesos sent so far / total dollars received so far.
-- A buy uses the latest row on or before its own date, so a later deposit never
-- changes the peso cost of an earlier buy. USDT counts as USD.
SELECT
    id,
    account_id,
    trade_date,
    SUM(php_amount) OVER running / SUM(units) OVER running AS avg_rate
FROM transactions
WHERE type = 'DEPOSIT'
  AND asset IN ('USD', 'USDT')
  AND php_amount IS NOT NULL
  AND units > 0
WINDOW running AS (PARTITION BY account_id ORDER BY trade_date, id ROWS UNBOUNDED PRECEDING)
ORDER BY account_id, trade_date, id;
