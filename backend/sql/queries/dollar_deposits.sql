-- Every USD or USDT deposit, for measuring FX cost against Yahoo's rate on the same day.
SELECT account_id, trade_date, units, php_amount
FROM transactions
WHERE type = 'DEPOSIT' AND asset IN ('USD', 'USDT') AND php_amount IS NOT NULL
ORDER BY account_id, trade_date, id;
