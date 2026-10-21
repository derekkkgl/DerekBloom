INSERT INTO assets (asset, yahoo_symbol, name, class, region, currency)
VALUES (:asset, :yahoo_symbol, :name, :class, :region, :currency)
ON CONFLICT (asset) DO NOTHING;
