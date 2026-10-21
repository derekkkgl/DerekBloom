INSERT INTO transactions
    (account_id, trade_date, type, asset, units, price, price_currency, fee, fee_currency, php_amount, note)
VALUES
    (:account_id, :trade_date, :type, :asset, :units, :price, :price_currency, :fee, :fee_currency, :php_amount, :note)
RETURNING id;
