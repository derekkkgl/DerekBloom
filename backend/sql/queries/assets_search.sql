-- Assets you've used, whose ticker starts with the search or whose name contains it.
SELECT asset, yahoo_symbol, name, class
FROM assets
WHERE asset LIKE :prefix ESCAPE '\' OR name LIKE :contains ESCAPE '\'
ORDER BY asset;
