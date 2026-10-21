UPDATE transactions
SET account_id     = :account_id,
    trade_date     = :trade_date,
    type           = :type,
    asset          = :asset,
    units          = :units,
    price          = :price,
    price_currency = :price_currency,
    fee            = :fee,
    fee_currency   = :fee_currency,
    php_amount     = :php_amount,
    note           = :note,
    updated_at     = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = :id;
