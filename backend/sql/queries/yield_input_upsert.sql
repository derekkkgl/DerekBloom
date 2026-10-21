INSERT INTO yield_inputs (asset, kind, rate_pct)
VALUES (:asset, :kind, :rate_pct)
ON CONFLICT (asset) DO UPDATE SET kind = excluded.kind, rate_pct = excluded.rate_pct;
