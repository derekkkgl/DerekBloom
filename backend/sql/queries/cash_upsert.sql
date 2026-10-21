INSERT INTO cash_balances (account_id, currency, amount)
VALUES (:account_id, :currency, :amount)
ON CONFLICT (account_id, currency) DO UPDATE
SET amount = excluded.amount,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now');
