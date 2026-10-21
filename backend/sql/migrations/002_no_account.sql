-- 002: the account is optional. The spare "Manual" account becomes "No account",
-- which a transaction gets when you don't pick one. Its id (4) stays the same.
UPDATE accounts SET name = 'No account' WHERE id = 4 AND name = 'Manual';
