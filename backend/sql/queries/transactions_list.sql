-- Every transaction, newest first, with its account name.
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
    t.source
FROM transactions AS t
JOIN accounts AS a ON a.id = t.account_id
ORDER BY t.trade_date DESC, t.id DESC;
