SELECT c.account_id, a.name AS account, c.currency, c.amount, c.updated_at
FROM cash_balances AS c
JOIN accounts AS a ON a.id = c.account_id
ORDER BY c.account_id, c.currency;
