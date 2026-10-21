-- Each account with what you've deposited in dollars and its average deposit rate.
SELECT
    a.id,
    a.name,
    COALESCE(d.php_sent, 0) AS deposited_php,
    COALESCE(d.usd_received, 0) AS received_usd,
    d.php_sent / NULLIF(d.usd_received, 0) AS avg_rate,
    d.first_deposit,
    d.last_deposit
FROM accounts AS a
LEFT JOIN (
    SELECT
        account_id,
        SUM(php_amount) AS php_sent,
        SUM(units) AS usd_received,
        MIN(trade_date) AS first_deposit,
        MAX(trade_date) AS last_deposit
    FROM transactions
    WHERE type = 'DEPOSIT' AND asset IN ('USD', 'USDT') AND php_amount IS NOT NULL
    GROUP BY account_id
) AS d ON d.account_id = a.id
ORDER BY a.id;
